/// <reference types="chrome"/>

document.addEventListener('DOMContentLoaded', function() {
  const scanPDFsButton = document.getElementById('scanPDFs') as HTMLButtonElement;
  

  const messageDiv = document.getElementById('message') as HTMLDivElement;
  
  const pdfListElement = document.getElementById('pdfList') as HTMLElement;

  // Store scanned PDFs
  let scannedPDFs: any[] = [];
  let isScanning = false;
  let selectedPDFs: Set<number> = new Set(); // Track selected PDF indices

  // Connect to background script for scan progress updates
  const port = chrome.runtime.connect({ name: 'popup' });
  port.onMessage.addListener((message) => {
    if (message.action === 'scanProgress') {
      handleScanProgress(message);
    } else if (message.action === 'downloadSuccess') {
      showMessage(`✅ COMPLETED: ${message.fileName}`, 'success');
      loadDownloadStats(); // Refresh stats after successful download
    } else if (message.action === 'downloadFailed') {
      showMessage(`❌ FAILED: ${message.fileName} - ${message.reason}`, 'error');
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
            showMessage('⚠️ No PDF files detected. Please make sure you are viewing a Knowledge Planet file gallery page with PDFs.', 'warning');
          }
        });
      } else {
        showMessage('❌ Please visit a Knowledge Planet page first', 'error');
      }
    });
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
          <div class="empty-text">No PDF files found on this page</div>
          <div class="empty-subtext">Try navigating to a Knowledge Planet file gallery with PDFs.</div>
        </div>
      `;
      return;
    }

    // Filter to show only eligible PDFs (5+ downloads)
    const eligiblePDFs = scannedPDFs.filter(pdf => pdf.downloadCount >= 5);
    const totalScanned = scannedPDFs.length;
    
    if (eligiblePDFs.length === 0) {
      pdfListElement.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📄</div>
          <div class="empty-text">No eligible PDFs found</div>
          <div class="empty-subtext">Scanned ${totalScanned} PDFs - none have 5+ downloads</div>
        </div>
      `;
      return;
    }

    const pdfListHtml = eligiblePDFs.map((pdf, index) => {
      const shortName = pdf.fileName.length > 65 ? pdf.fileName.substring(0, 65) + '...' : pdf.fileName;
      const uploadDate = pdf.uploadDate || '';
      const isSelected = selectedPDFs.has(pdf.index); // Use original index from scannedPDFs
      
      return `
        <div class="pdf-item" data-index="${pdf.index}">
          <div style="display: flex; align-items: flex-start; gap: 8px;">
            <input type="checkbox" class="pdf-checkbox" data-index="${pdf.index}" 
                   ${isSelected ? 'checked' : ''} 
                   style="margin-top: 2px; cursor: pointer;">
            <div style="flex: 1; min-width: 0;">
              <div class="pdf-name" title="${pdf.fileName}">📄 ${shortName}</div>
              <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
                  <div class="pdf-downloads eligible">${pdf.downloadCount} downloads</div>
                  ${uploadDate ? `
                    <div class="pdf-date" style="font-size: 11px; color: #666;">
                      📅 ${uploadDate}
                    </div>
                  ` : ''}
                </div>
                <button class="pdf-btn pdf-btn-download" data-action="download" data-index="${pdf.index}" 
                        style="padding: 2px 6px; font-size: 9px; margin: 0; width: 20px; height: 20px; border-radius: 3px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
                  ⬇️
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    pdfListElement.innerHTML = pdfListHtml;

    // Add note about filtering and batch controls
    const eligibleCount = eligiblePDFs.length;
    const filterNote = `
      <div style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px; font-size: 10px; color: #6c757d;">
        ℹ️ Showing only today's PDFs with 5+ downloads (${eligibleCount} eligible)
      </div>
    `;
    pdfListElement.insertAdjacentHTML('afterbegin', filterNote);

    if (eligibleCount > 0) {
      const batchControls = `
        <div class="batch-controls" style="margin-top: 10px; padding: 8px; border-top: 1px solid #ddd;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <span style="font-size: 11px; color: #666; flex-shrink: 0;">
              <span id="selected-count">0</span> of ${eligibleCount} selected
            </span>
            <div style="display: flex; gap: 6px;">
              <button id="select-all-btn" class="pdf-btn" style="font-size: 10px; padding: 3px 6px; width: auto; min-width: auto;">
                Select All
              </button>
              <button id="download-selected-btn" class="pdf-btn pdf-btn-download" style="font-size: 10px; padding: 3px 8px; opacity: 0.5; width: auto; min-width: auto;" disabled>
                ⬇️ Download
              </button>
            </div>
          </div>
        </div>
      `;
      pdfListElement.insertAdjacentHTML('beforeend', batchControls);
      
      // Update batch controls to reflect current selection state
      updateBatchControls();
    }

    // Add event listeners for PDF actions and checkboxes
    pdfListElement.addEventListener('click', handlePDFAction);
    pdfListElement.addEventListener('change', handleCheckboxChange);
  }

  // Handle PDF actions (download only)
  function handlePDFAction(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('pdf-btn')) return;

    const action = target.dataset.action;
    const index = parseInt(target.dataset.index || '0');
    const pdf = scannedPDFs.find(p => p.index === index);

    if (!pdf || action !== 'download') return;

    // Disable the button temporarily
    target.setAttribute('disabled', 'true');
    target.textContent = '🔄';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (currentTab?.id) {
        // Send message to download PDF
        chrome.tabs.sendMessage(currentTab.id, { 
          action: 'downloadPDF', 
          pdfIndex: pdf.index,
          expectedFileName: pdf.fileName,
          downloadCount: pdf.downloadCount
        }, (response) => {
          // Re-enable button
          target.removeAttribute('disabled');
          target.textContent = '⬇️';
          
          if (chrome.runtime.lastError) {
            console.error('Download message error:', chrome.runtime.lastError);
            showMessage(`❌ Failed to start download: ${pdf.fileName}`, 'error');
          } else if (response?.status) {
            console.log(`🔄 Download queued:`, response.status);
          }
        });
      } else {
        // Re-enable button
        target.removeAttribute('disabled');
        target.textContent = '⬇️';
        showMessage(`❌ No active tab found`, 'error');
      }
    });
  }

  // Handle checkbox changes for PDF selection
  function handleCheckboxChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.classList.contains('pdf-checkbox')) {
      const index = parseInt(target.dataset.index || '0');
      
      if (target.checked) {
        selectedPDFs.add(index);
      } else {
        selectedPDFs.delete(index);
      }
      
      updateBatchControls();
    }
  }

  // Update batch control buttons and counters
  function updateBatchControls() {
    const selectedCountElement = document.getElementById('selected-count');
    const downloadSelectedBtn = document.getElementById('download-selected-btn') as HTMLButtonElement;
    const selectAllBtn = document.getElementById('select-all-btn') as HTMLButtonElement;
    
    if (selectedCountElement) {
      selectedCountElement.textContent = selectedPDFs.size.toString();
    }
    
    if (downloadSelectedBtn) {
      downloadSelectedBtn.disabled = selectedPDFs.size === 0;
      downloadSelectedBtn.style.opacity = selectedPDFs.size === 0 ? '0.5' : '1';
    }
    
    if (selectAllBtn) {
      const eligiblePDFs = scannedPDFs.filter(pdf => pdf.downloadCount >= 5);
      const allSelected = eligiblePDFs.length > 0 && selectedPDFs.size === eligiblePDFs.length;
      selectAllBtn.textContent = allSelected ? 'Deselect All' : 'Select All';
    }
  }

  // Handle batch download
  async function handleBatchDownload() {
    if (selectedPDFs.size === 0) return;
    
    const selectedPDFList = Array.from(selectedPDFs).map(index => scannedPDFs[index]);
    
    // Debug: Log selected PDFs to identify duplicates
    console.log(`📦 Selected PDF indices:`, Array.from(selectedPDFs));
    console.log(`📦 Selected PDF list:`, selectedPDFList.map(pdf => `"${pdf.fileName}" (index: ${pdf.index})`));
    
    // Remove duplicates by filename to prevent same PDF being downloaded twice
    const uniquePDFList = selectedPDFList.filter((pdf, index, array) => {
      const firstOccurrence = array.findIndex(p => p.fileName === pdf.fileName);
      if (firstOccurrence !== index) {
        console.warn(`🚫 Skipping duplicate PDF: "${pdf.fileName}" (index: ${pdf.index})`);
        return false;
      }
      return true;
    });
    
    if (uniquePDFList.length !== selectedPDFList.length) {
      console.log(`📋 Filtered ${selectedPDFList.length - uniquePDFList.length} duplicate PDFs`);
    }
    
    let successCount = 0;
    let failureCount = 0;
    
    // Disable the batch download button during processing
    const batchDownloadBtn = document.getElementById('download-selected-btn') as HTMLButtonElement;
    if (batchDownloadBtn) {
      batchDownloadBtn.disabled = true;
      batchDownloadBtn.textContent = 'Queueing...';
    }
    
    for (let i = 0; i < uniquePDFList.length; i++) {
      const pdf = uniquePDFList[i];
      console.log(`\n📦 Processing ${i + 1}/${uniquePDFList.length}: "${pdf.fileName}"`);
      
      try {
        await new Promise<void>((resolve, reject) => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs[0];
            if (currentTab?.id) {
              console.log(`📤 Sending download request for: "${pdf.fileName}"`);
              
              // Send download message and wait for response
              chrome.tabs.sendMessage(currentTab.id, { 
                action: 'downloadPDF', 
                pdfIndex: pdf.index,
                expectedFileName: pdf.fileName
              }, (response) => {
                if (chrome.runtime.lastError) {
                  console.error('Message sending error:', chrome.runtime.lastError);
                  failureCount++;
                  reject(chrome.runtime.lastError);
                } else if (response?.status) {
                  successCount++;
                  console.log(`🔄 Download queued successfully for: "${pdf.fileName}"`);
                  resolve();
                } else {
                  failureCount++;
                  console.warn(`⚠️ No response for: "${pdf.fileName}"`);
                  resolve(); // Continue with next download
                }
              });
              
              // Timeout fallback
              setTimeout(() => {
                console.warn(`⏰ Download timeout for: "${pdf.fileName}"`);
                failureCount++;
                resolve();
              }, 10000); // Increased timeout to 10 seconds
            } else {
              failureCount++;
              reject(new Error('No active tab'));
            }
          });
        });
        
                 // Wait between downloads to prevent interference
         if (i < uniquePDFList.length - 1) {
           console.log(`⏸️ Waiting 2 seconds before next download...`);
           await new Promise(resolve => setTimeout(resolve, 2000)); // Reduced to 2 seconds for faster processing
         }
        
      } catch (error) {
        console.error('Error downloading PDF:', pdf.fileName, error);
        failureCount++;
      }
    }
    
    // Re-enable the batch download button
    if (batchDownloadBtn) {
      batchDownloadBtn.disabled = false;
      batchDownloadBtn.textContent = '⬇️ Download';
    }
    
    // Clear selections
    selectedPDFs.clear();
    updatePDFList();
    
    // Refresh download stats after batch completion
    setTimeout(() => {
      loadDownloadStats();
    }, 2000);
  }

  // Handle select all/deselect all
  function handleSelectAll() {
    const eligiblePDFs = scannedPDFs.filter(pdf => pdf.downloadCount >= 5);
    const allSelected = eligiblePDFs.length > 0 && selectedPDFs.size === eligiblePDFs.length;
    
    if (allSelected) {
      // Deselect all
      selectedPDFs.clear();
    } else {
      // Select all eligible PDFs
      eligiblePDFs.forEach(pdf => selectedPDFs.add(pdf.index));
    }
    
    updatePDFList();
    // Also update the batch controls after the list is updated
    setTimeout(() => updateBatchControls(), 0);
  }

  // Add event listeners for dynamically added buttons
  document.addEventListener('click', function(e) {
    const target = e.target as HTMLElement;
    
    if (target.id === 'view-downloads') {
      showDownloadHistory();
    } else if (target.id === 'download-selected-btn') {
      handleBatchDownload();
    } else if (target.id === 'select-all-btn') {
      handleSelectAll();
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