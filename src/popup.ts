/// <reference types="chrome"/>

document.addEventListener('DOMContentLoaded', function() {
  const scanPDFsButton = document.getElementById('scanPDFs') as HTMLButtonElement;
  

  const messageDiv = document.getElementById('message') as HTMLDivElement;
  
  const pdfListElement = document.getElementById('pdfList') as HTMLElement;

  // Store scanned PDFs
  let scannedPDFs: any[] = [];
  let isScanning = false;
  let selectedPDFs: Set<number> = new Set(); // Track selected PDF indices
  let currentScanDays = 1; // Track current scan range

  // Connect to background script for scan progress updates
  const port = chrome.runtime.connect({ name: 'popup' });
  port.onMessage.addListener((message) => {
    if (message.action === 'scanProgress') {
      handleScanProgress(message);
    } else if (message.action === 'downloadSuccess') {
      showMessage(`✅ 完成: ${message.fileName}`, 'success');
      loadDownloadStats(); // Refresh stats after successful download
    } else if (message.action === 'downloadFailed') {
      showMessage(`❌ 失败: ${message.fileName} - ${message.reason}`, 'error');
    }
  });

  // Load and display download statistics
  loadDownloadStats();

  // Handle scan progress updates
  function handleScanProgress(progress: any) {
    const { type, total, scanned, eligible, pdfs, currentPdf, scanDays } = progress;
    const scanDescription = scanDays === 1 ? '今天' : `最近${scanDays}天`;
    
    if (type === 'start') {
      isScanning = true;
      scanPDFsButton.disabled = true;
      scanPDFsButton.textContent = `🔄 开始扫描...`;
      scannedPDFs = [];
      updatePDFList();
      showMessage(`🔍 开始扫描 ${total} 个PDF（${scanDescription}）...`, 'success');
    } else if (type === 'progress') {
      scanPDFsButton.textContent = `🔄 扫描中 ${scanned}/${total}...`;
      scannedPDFs = [...pdfs]; // Update with current results
      updatePDFList();
      
      // Update stats in real-time
      
      
      if (currentPdf) {
        const status = currentPdf.downloadCount >= 5 ? '✅ 符合条件' : '⏳ 不符合条件';
        showMessage(`📄 ${currentPdf.fileName} - ${currentPdf.downloadCount} 次下载（${status}）`, 'success');
      }
    } else if (type === 'complete') {
      isScanning = false;
      scanPDFsButton.disabled = false;
      scanPDFsButton.textContent = '🔍 扫描';
      scannedPDFs = [...pdfs];
      updatePDFList();
      
      // Update final stats
      
      
      showMessage(`✅ 扫描完成！从${scanDescription}找到 ${eligible} 个符合条件的PDF`, 'success');
      loadDownloadStats(); // Refresh stats
    }
  }

  // Handle scan mode change to show/hide custom date picker
  const scanModeSelect = document.getElementById('scanMode') as HTMLSelectElement;
  const customDateSection = document.getElementById('customDateSection') as HTMLDivElement;
  const customDateInput = document.getElementById('customDate') as HTMLInputElement;
  
  // Set default max date (today) and min date (30 days ago)
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  customDateInput.max = today.toISOString().split('T')[0];
  customDateInput.min = thirtyDaysAgo.toISOString().split('T')[0];
  customDateInput.value = today.toISOString().split('T')[0]; // Default to today
  
  scanModeSelect.addEventListener('change', function() {
    if (scanModeSelect.value === 'custom') {
      customDateSection.style.display = 'block';
    } else {
      customDateSection.style.display = 'none';
    }
  });

  // Scan PDFs button functionality
  scanPDFsButton.addEventListener('click', function() {
    if (isScanning) {
      showMessage('⚠️ 扫描正在进行中...', 'warning');
      return;
    }
    
    // Get selected scan mode and determine date range
    const scanMode = scanModeSelect.value;
    let scanDays: number;
    let customDate: string | null = null;
    
    if (scanMode === 'custom') {
      const selectedDate = customDateInput.value;
      if (!selectedDate) {
        showMessage('⚠️ 请选择日期', 'warning');
        return;
      }
      
      // Validate date is not more than 30 days ago
      const selected = new Date(selectedDate);
      const maxPastDate = new Date(today);
      maxPastDate.setDate(today.getDate() - 30);
      
      if (selected < maxPastDate) {
        showMessage('⚠️ 日期不能超过30天前', 'warning');
        return;
      }
      
      if (selected > today) {
        showMessage('⚠️ 日期不能是未来', 'warning');
        return;
      }
      
      customDate = selectedDate;
      // Calculate days difference for legacy compatibility
      const diffTime = today.getTime() - selected.getTime();
      scanDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    } else {
      // Parse days from the mode value (e.g., "days-7" -> 7)
      scanDays = parseInt(scanMode.split('-')[1]) || 1;
    }
    
    currentScanDays = scanDays; // Store current scan range
    
    // Send message to active tab to scan for PDFs with progress updates
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (currentTab?.id && currentTab.url?.includes('wx.zsxq.com')) {
        const tabId = currentTab.id as number;
        // Trigger the progressive scan with selected days and custom date
        chrome.tabs.sendMessage(tabId, { 
          action: 'scanPDFsWithProgress',
          scanDays: scanDays,
          customDate: customDate
        }, (response) => {
          // Final response handling (scan completion is handled via progress messages)
          if (!response || !response.success) {
            isScanning = false;
            scanPDFsButton.disabled = false;
            scanPDFsButton.textContent = '🔍 扫描';
            showMessage('⚠️ 未检测到PDF文件。请确保您正在查看知识星球文件库页面。', 'warning');
          }
        });
      } else {
        showMessage('❌ 请先访问知识星球页面', 'error');
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
      showMessage('❌ 加载统计信息出错', 'error');
    }
  }

  // Update PDF list display
  function updatePDFList() {
    if (scannedPDFs.length === 0) {
      pdfListElement.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📄</div>
          <div class="empty-text">页面上没有找到PDF文件</div>
          <div class="empty-subtext">请尝试浏览知识星球文件库页面。</div>
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
          <div class="empty-text">没有找到符合条件的PDF</div>
          <div class="empty-subtext">已扫描 ${totalScanned} 个PDF - 没有5次以上下载的</div>
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
                  <div class="pdf-downloads eligible">${pdf.downloadCount} 次下载</div>
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
    const scanDescription = currentScanDays === 1 ? "今天" : `最近${currentScanDays}天`;
    const filterNote = `
      <div style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px; font-size: 10px; color: #6c757d;">
        ℹ️ 仅显示${scanDescription}下载5次以上的PDF（${eligibleCount}个符合条件）
      </div>
    `;
    pdfListElement.insertAdjacentHTML('afterbegin', filterNote);

    if (eligibleCount > 0) {
      const batchControls = `
        <div class="batch-controls" style="margin-top: 10px; padding: 8px; border-top: 1px solid #ddd;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <span style="font-size: 11px; color: #666; flex-shrink: 0;">
              已选择 <span id="selected-count">0</span> / ${eligibleCount}
            </span>
            <div style="display: flex; gap: 6px;">
              <button id="select-all-btn" class="pdf-btn" style="font-size: 10px; padding: 3px 6px; width: auto; min-width: auto;">
                全选
              </button>
              <button id="download-selected-btn" class="pdf-btn pdf-btn-download" style="font-size: 10px; padding: 3px 8px; opacity: 0.5; width: auto; min-width: auto;" disabled>
                ⬇️ 下载
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
            showMessage(`❌ 下载失败: ${pdf.fileName}`, 'error');
          } else if (response?.status) {
            console.log(`🔄 Download queued:`, response.status);
          }
        });
      } else {
        // Re-enable button
        target.removeAttribute('disabled');
        target.textContent = '⬇️';
        showMessage(`❌ 未找到活动标签页`, 'error');
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
      selectAllBtn.textContent = allSelected ? '取消全选' : '全选';
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
      batchDownloadBtn.textContent = '队列中...';
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
      batchDownloadBtn.textContent = '⬇️ 下载';
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
        messageDiv.innerHTML = '<div style="color: #fff; font-size: 11px;">暂无下载记录!</div>';
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
              <strong>📄 下载历史</strong>
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
                  下载次数: ${pdf.downloadCount} | ${new Date(pdf.downloadedAt).toLocaleDateString()}
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