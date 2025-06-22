/// <reference types="chrome"/>

document.addEventListener('DOMContentLoaded', function() {
  const scanPDFsButton = document.getElementById('scanPDFs') as HTMLButtonElement;
  const clearDataButton = document.getElementById('clearData') as HTMLButtonElement;

  const messageDiv = document.getElementById('message') as HTMLDivElement;
  const pdfCountElement = document.getElementById('pdfCount') as HTMLElement;
  const eligibleCountElement = document.getElementById('eligibleCount') as HTMLElement;
  const pdfListElement = document.getElementById('pdfList') as HTMLElement;

  // Store scanned PDFs
  let scannedPDFs: any[] = [];
  let isScanning = false;

  // Connect to background script for scan progress updates
  const port = chrome.runtime.connect({ name: 'popup' });
  port.onMessage.addListener((message) => {
    if (message.action === 'scanProgress') {
      handleScanProgress(message);
    }
  });

  // Load and display download statistics
  loadDownloadStats();

  // Handle scan progress updates
  function handleScanProgress(progress: any) {
    const { type, total, scanned, eligible, pdfs, currentPdf } = progress;
    
    if (type === 'start') {
      isScanning = true;
      scanPDFsButton.disabled = true;
      scanPDFsButton.textContent = `🔄 Starting scan...`;
      scannedPDFs = [];
      updatePDFList();
      showMessage(`🔍 Starting scan of ${total} PDFs...`, 'success');
    } else if (type === 'progress') {
      scanPDFsButton.textContent = `🔄 Scanning ${scanned}/${total}...`;
      scannedPDFs = [...pdfs]; // Update with current results
      updatePDFList();
      
      // Update stats in real-time
      pdfCountElement.textContent = scanned.toString();
      eligibleCountElement.textContent = eligible.toString();
      
      if (currentPdf) {
        const status = currentPdf.downloadCount >= 5 ? '✅ Eligible' : '⏳ Not eligible';
        showMessage(`📄 ${currentPdf.fileName} - ${currentPdf.downloadCount} downloads (${status})`, 'success');
      }
    } else if (type === 'complete') {
      isScanning = false;
      scanPDFsButton.disabled = false;
      scanPDFsButton.textContent = '🔍 Scan Current Page';
      scannedPDFs = [...pdfs];
      updatePDFList();
      
      // Update final stats
      pdfCountElement.textContent = total.toString();
      eligibleCountElement.textContent = eligible.toString();
      
      showMessage(`✅ Scan complete! Found ${total} PDFs, ${eligible} eligible for download`, 'success');
      loadDownloadStats(); // Refresh stats
    }
  }

  // Scan PDFs button functionality
  scanPDFsButton.addEventListener('click', function() {
    if (isScanning) {
      showMessage('⚠️ Scan already in progress...', 'warning');
      return;
    }
    
    // Send message to active tab to scan for PDFs with progress updates
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (currentTab?.id && currentTab.url?.includes('wx.zsxq.com')) {
        const tabId = currentTab.id as number;
        // Trigger the progressive scan
        chrome.tabs.sendMessage(tabId, { action: 'scanPDFsWithProgress' }, (response) => {
          // Final response handling (scan completion is handled via progress messages)
          if (!response || !response.success) {
            isScanning = false;
            scanPDFsButton.disabled = false;
            scanPDFsButton.textContent = '🔍 Scan Current Page';
            showMessage('⚠️ Make sure you\'re on a Knowledge Planet page', 'warning');
          }
        });
      } else {
        showMessage('❌ Please visit a Knowledge Planet page first', 'error');
      }
    });
  });

  // Clear data button functionality
  clearDataButton.addEventListener('click', async function() {
    if (confirm('Are you sure you want to clear all extension data?')) {
      try {
        await chrome.storage.local.clear();
        showMessage('🗑️ All data cleared successfully', 'success');
        loadDownloadStats(); // Refresh stats
      } catch (error) {
        showMessage('❌ Error clearing data', 'error');
      }
    }
  });

  // Show message function
  function showMessage(text: string, type: 'success' | 'warning' | 'error' = 'success') {
    messageDiv.className = `message-${type}`;
    messageDiv.textContent = text;
    
    // Clear message after 3 seconds
    setTimeout(() => {
      messageDiv.textContent = '';
      messageDiv.className = '';
    }, 3000);
  }

  // Load download statistics
  async function loadDownloadStats() {
    try {
      const result = await chrome.storage.local.get(['downloadStats', 'downloadedPDFs']);
      const downloadStats = result.downloadStats || {};
      const downloadedPDFs = result.downloadedPDFs || [];
      
      // Update stat cards
      const totalTracked = Object.keys(downloadStats).length;
      const eligibleCount = Object.values(downloadStats).filter((count: any) => count >= 5).length;
      
      pdfCountElement.textContent = totalTracked.toString();
      eligibleCountElement.textContent = eligibleCount.toString();
      
    } catch (error) {
      console.error('Error loading download stats:', error);
      showMessage('❌ Error loading stats', 'error');
    }
  }

  // Update PDF list display
  function updatePDFList() {
    if (scannedPDFs.length === 0) {
      pdfListElement.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📄</div>
          <div class="empty-text">No PDFs scanned yet</div>
          <div class="empty-subtext">Click "Scan Current Page" to find PDFs</div>
        </div>
      `;
      return;
    }

    const pdfListHtml = scannedPDFs.map((pdf, index) => {
      const isEligible = pdf.downloadCount >= 5;
      const shortName = pdf.fileName.length > 45 ? pdf.fileName.substring(0, 45) + '...' : pdf.fileName;
      const uploadDate = pdf.uploadDate || '';
      
      return `
        <div class="pdf-item" data-index="${index}">
          <div class="pdf-header">
            <div class="pdf-name" title="${pdf.fileName}">📄 ${shortName}</div>
            <div class="pdf-downloads ${isEligible ? 'eligible' : ''}">${pdf.downloadCount} downloads</div>
          </div>
          ${uploadDate ? `
            <div class="pdf-date" style="font-size: 11px; color: #666; margin-top: 4px;">
              📅 ${uploadDate}
            </div>
          ` : ''}
          ${isEligible ? `
            <div class="pdf-actions">
              <button class="pdf-btn pdf-btn-download" data-action="download" data-index="${index}">
                ⬇️ Download
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    pdfListElement.innerHTML = pdfListHtml;

    // Add event listeners for PDF actions
    pdfListElement.addEventListener('click', handlePDFAction);
  }

  // Handle PDF actions (download only)
  function handlePDFAction(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('pdf-btn')) return;

    const action = target.dataset.action;
    const index = parseInt(target.dataset.index || '0');
    const pdf = scannedPDFs[index];

    if (!pdf || action !== 'download') return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (currentTab?.id) {
        // Send message to download PDF
        chrome.tabs.sendMessage(currentTab.id, { 
          action: 'downloadPDF', 
          pdfIndex: index 
        });
        showMessage(`📄 Downloading: ${pdf.fileName}`, 'success');
      }
    });
  }

  // Add event listener for view downloads button (dynamically added)
  document.addEventListener('click', function(e) {
    if ((e.target as HTMLElement).id === 'view-downloads') {
      showDownloadHistory();
    }
  });

  async function showDownloadHistory() {
    try {
      const result = await chrome.storage.local.get(['downloadedPDFs']);
      const downloadedPDFs = result.downloadedPDFs || [];
      
      if (downloadedPDFs.length === 0) {
        messageDiv.innerHTML = '<div style="color: #fff; font-size: 11px;">No downloads yet!</div>';
        return;
      }
      
      // Create download history popup
      const historyHtml = `
        <div style="
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.8);
          z-index: 1000;
          display: flex;
          justify-content: center;
          align-items: center;
        " id="download-history-overlay">
          <div style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 10px;
            max-width: 350px;
            max-height: 400px;
            overflow-y: auto;
          ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <strong>📄 Download History</strong>
              <button id="close-history" style="
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 12px;
              ">×</button>
            </div>
            ${downloadedPDFs.map((pdf: any) => `
              <div style="
                padding: 10px;
                margin: 8px 0;
                background: rgba(255,255,255,0.1);
                border-radius: 5px;
                font-size: 11px;
              ">
                <div style="font-weight: bold; margin-bottom: 5px;">${pdf.fileName}</div>
                <div style="opacity: 0.8; font-size: 9px;">
                  Downloads: ${pdf.downloadCount} | ${new Date(pdf.downloadedAt).toLocaleDateString()}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', historyHtml);
      
      // Add close button listener
      document.getElementById('close-history')?.addEventListener('click', () => {
        document.getElementById('download-history-overlay')?.remove();
      });
      
    } catch (error) {
      console.error('Error showing download history:', error);
    }
  }

  // Refresh stats every few seconds
  setInterval(loadDownloadStats, 5000);
}); 