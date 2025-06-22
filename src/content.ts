/// <reference types="chrome"/>

// Content script for Knowledge Planet Helper
console.log('Knowledge Planet Helper: Content script loaded! 🎯');

// Interface for PDF info
interface PDFInfo {
  element: HTMLElement;
  fileName: string;
  downloadCount: number;
  uploadDate: string;
  index: number;
}

// Function to detect PDF files in the file gallery
function detectPDFFiles(): HTMLElement[] {
  const pdfItems: HTMLElement[] = [];
  
  // Look for file gallery items with PDF icons
  const fileItems = document.querySelectorAll('.file-gallery-container .item');
  
  fileItems.forEach((item) => {
    const fileIcon = item.querySelector('.file-icon.file-pdf');
    const fileName = item.querySelector('.file-name');
    
    if (fileIcon && fileName) {
      pdfItems.push(item as HTMLElement);
    }
  });
  
  return pdfItems;
}

// Function to extract download count from modal
function extractDownloadCount(): number {
  // Try multiple selectors and text patterns to be more robust
  const downloadRecord = document.querySelector('.download-record');
  if (downloadRecord) {
    const text = downloadRecord.textContent || '';
    console.log('📊 Download record text:', text);
    
    // Focus on the most accurate patterns first, based on actual HTML structure
    const patterns = [
      /（下载次数：(\d+)）/,      // Chinese parentheses with colon (most accurate)
      /\(下载次数：(\d+)\)/,       // Regular parentheses with colon
      /下载次数：(\d+)/,          // Just with colon
      /下载次数[\s：:]*(\d+)/,    // Flexible spacing and colon variations
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const count = parseInt(match[1]);
        console.log(`✅ Extracted download count: ${count} using pattern: ${pattern.source}`);
        return count;
      }
    }
    
    // Try extracting from the span specifically
    const spanElement = downloadRecord.querySelector('span.ng-star-inserted');
    if (spanElement) {
      const spanText = spanElement.textContent || '';
      console.log('📊 Span text:', spanText);
      const match = spanText.match(/（下载次数：(\d+)）/);
      if (match) {
        const count = parseInt(match[1]);
        console.log(`✅ Extracted download count from span: ${count}`);
        return count;
      }
    }
    
    console.warn('⚠️ Could not extract download count from text:', text);
  } else {
    console.warn('⚠️ Could not find .download-record element');
    
    // Try searching in the entire modal
    const modal = document.querySelector('app-file-preview');
    if (modal) {
      const allText = modal.textContent || '';
      const match = allText.match(/（下载次数：(\d+)）/);
      if (match) {
        const count = parseInt(match[1]);
        console.log(`✅ Extracted download count from modal: ${count}`);
        return count;
      }
    }
  }
  
  return 0;
}

// Function to get PDF info from the modal
function getPDFInfoFromModal(): { downloadCount: number; fileName: string; uploadDate: string } {
  console.log('📋 Extracting PDF info from modal...');
  
  // Get filename from modal
  const fileNameElement = document.querySelector('app-file-preview .file-name');
  const fileName = fileNameElement?.textContent?.trim() || '';
  
  // Get upload date from modal
  const uploadDateElement = document.querySelector('app-file-preview .upload-date');
  const uploadDate = uploadDateElement?.textContent?.trim() || '';
  
  // Get download count from modal text
  let downloadCount = 0;
  const modal = document.querySelector('app-file-preview');
  
  if (modal) {
    const allText = modal.textContent || '';
    
    // Simple pattern matching - use only the patterns that work
    const patterns = [
      /（下载次数：(\d+)）/,
      /\(下载次数：(\d+)\)/,
      /下载次数：(\d+)/
    ];
    
    for (const pattern of patterns) {
      const match = allText.match(pattern);
      if (match && match[1]) {
        downloadCount = parseInt(match[1], 10);
        console.log(`📊 Pattern matched: ${downloadCount} downloads`);
        break;
      }
    }
  }
  
  console.log(`📊 Final extracted info - File: "${fileName}", Downloads: ${downloadCount}, Upload Date: "${uploadDate}"`);
  
  return {
    downloadCount,
    fileName,
    uploadDate
  };
}

// Function to close modal
function closeModal(): Promise<void> {
  return new Promise((resolve) => {
    console.log('🔄 Attempting to close modal by clicking file-preview-container...');
    
    // Click on the file-preview-container
    const container = document.querySelector('app-file-preview .file-preview-container');
    if (container) {
      console.log('📱 Clicking on file-preview-container');
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true
      });
      container.dispatchEvent(clickEvent);
    } else {
      console.warn('⚠️ Could not find file-preview-container element');
    }
    
    // Wait and resolve
    setTimeout(() => {
      console.log('✅ Modal close attempt completed');
      resolve();
    }, 500);
  });
}

// Function to wait for modal to be fully loaded
function waitForModalContent(): Promise<boolean> {
  return new Promise((resolve) => {
    let attempts = 0;
          const maxAttempts = 10; // 5 seconds timeout (10 × 500ms)
    
    const checkModal = () => {
      const modal = document.querySelector('app-file-preview');
      
      console.log(`🔍 Modal check attempt ${attempts + 1}/${maxAttempts}:`);
      console.log(`  - Modal exists: ${!!modal}`);
      
      if (!modal) {
        attempts++;
        if (attempts >= maxAttempts) {
          console.warn('⚠️ Modal did not appear within timeout');
          resolve(false);
        } else {
          setTimeout(checkModal, 500);
        }
        return;
      }
      
      // Modal exists, now check if it has any content
      const modalHasContent = modal.innerHTML.trim().length > 100; // Basic content check
      const downloadRecord = modal.querySelector('.download-record');
      const fileName = modal.querySelector('.file-name');
      const hasText = modal.textContent && modal.textContent.trim().length > 10;
      
      console.log(`  - Modal has content: ${modalHasContent}`);
      console.log(`  - Download record exists: ${!!downloadRecord}`);
      console.log(`  - File name exists: ${!!fileName}`);
      console.log(`  - Has text content: ${hasText}`);
      
      // More flexible conditions - modal just needs to have some content
      if (modalHasContent && hasText) {
        console.log('✅ Modal content loaded successfully');
        // Wait a bit more to ensure content is stable
        setTimeout(() => resolve(true), 500);
      } else {
        attempts++;
        if (attempts >= maxAttempts) {
          console.warn('⚠️ Modal content did not load within timeout');
          
          // Debug: Show what's actually in the DOM
          const allModals = document.querySelectorAll('[class*="modal"], [class*="preview"], [class*="dialog"], app-file-preview');
          console.log(`🔍 Found ${allModals.length} potential modal elements:`, allModals);
          
          if (modal) {
            console.log('🔍 Modal HTML (first 1000 chars):', modal.innerHTML.substring(0, 1000));
            console.log('🔍 Modal text content:', modal.textContent?.substring(0, 500));
          }
          
          // Try to extract info even if not fully loaded
          resolve(true);
        } else {
          setTimeout(checkModal, 500);
        }
      }
    };
    
    checkModal();
  });
}

// Function to wait for modal to completely disappear
function waitForModalToClose(): Promise<void> {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 20;
    
    const checkModalGone = () => {
      const modal = document.querySelector('app-file-preview');
      if (!modal) {
        console.log('✅ Modal completely removed from DOM');
        resolve();
      } else {
        attempts++;
        if (attempts >= maxAttempts) {
          console.warn('⚠️ Modal still present, force resolving');
          resolve();
        } else {
          setTimeout(checkModalGone, 100);
        }
      }
    };
    
    checkModalGone();
  });
}

// Function to scan single PDF for download count
function scanSinglePDF(pdfElement: HTMLElement, pdfIndex: number): Promise<PDFInfo | null> {
  return new Promise((resolve) => {
    const fileName = pdfElement.querySelector('.file-name')?.textContent?.trim() || '';
    console.log(`🔍 [${pdfIndex + 1}] Scanning PDF: ${fileName}`);
    
    // Ensure no modal is open before starting
    const existingModal = document.querySelector('app-file-preview');
    if (existingModal) {
      console.log('⚠️ Modal already open, removing first');
      existingModal.remove();
    }
    
    // Wait a bit to ensure page is ready
    setTimeout(async () => {
      console.log(`📱 [${pdfIndex + 1}] Clicking PDF element with multiple methods...`);
      
      // Method 1: Regular click
      pdfElement.click();
      
      // Method 2: Dispatch click event
      setTimeout(() => {
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        pdfElement.dispatchEvent(clickEvent);
      }, 100);
      
      // Method 3: Try clicking child elements
      setTimeout(() => {
        const fileIcon = pdfElement.querySelector('.file-icon');
        const fileName = pdfElement.querySelector('.file-name');
        
        if (fileIcon) {
          console.log('📱 Also clicking file icon...');
          (fileIcon as HTMLElement).click();
        }
        
        if (fileName) {
          console.log('📱 Also clicking file name...');
          (fileName as HTMLElement).click();
        }
      }, 200);
      
      // Wait for modal to be fully loaded before extracting info
      setTimeout(async () => {
        const modalLoaded = await waitForModalContent();
        
        if (modalLoaded) {
          // Wait additional time to ensure content is stable before extracting
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          console.log(`📋 [${pdfIndex + 1}] Modal content ready, extracting data...`);
          
          // Double-check we have the right modal content
          const modalFileName = document.querySelector('app-file-preview .file-name')?.textContent?.trim();
          console.log(`📋 [${pdfIndex + 1}] Modal filename: ${modalFileName}`);
          
          if (modalFileName === fileName) {
            const { downloadCount, uploadDate } = getPDFInfoFromModal();
            
            console.log(`📊 [${pdfIndex + 1}] PDF: ${fileName} - ${downloadCount} downloads, uploaded: ${uploadDate}`);
            
            // Close modal and wait for it to disappear
            await closeModal();
            await waitForModalToClose();
            
            // Wait extra time between scans
            setTimeout(() => {
              // Always return the PDF info with actual download count
              resolve({
                element: pdfElement,
                fileName,
                downloadCount,
                uploadDate,
                index: pdfIndex
              });
              console.log(`📊 [${pdfIndex + 1}] PDF "${fileName}" has ${downloadCount} downloads ${downloadCount >= 5 ? '(eligible)' : '(not eligible)'}`);
            }, 100); // Reduced wait time
          } else {
            console.warn(`⚠️ [${pdfIndex + 1}] Modal filename mismatch! Expected: ${fileName}, Got: ${modalFileName}`);
            
            await closeModal();
            await waitForModalToClose();
            setTimeout(() => resolve(null), 100); // Reduced wait time
          }
        } else {
          console.warn(`⚠️ [${pdfIndex + 1}] Could not load modal for PDF: ${fileName}`);
          
          // Try to restore modal visibility if it exists
          const modal = document.querySelector('app-file-preview') as HTMLElement;
          if (modal) {
            modal.style.display = '';
          }
          
          await closeModal();
          await waitForModalToClose();
          setTimeout(() => resolve(null), 100); // Reduced wait time
        }
      }, 1500); // Further increased timeout for modal to open
    }, 500); // Increased initial delay before clicking
  });
}

// Function to scan all PDFs and get eligible ones
async function scanAllPDFs(): Promise<PDFInfo[]> {
  const allPDFs = detectPDFFiles();
  const eligiblePDFs: PDFInfo[] = [];
  
  if (allPDFs.length === 0) {
    return eligiblePDFs;
  }
  
  console.log(`🔍 [DEBUG] Starting scan of FIRST 3 PDFs only (out of ${allPDFs.length} total) for debugging...`);
  
  // Show scanning message
  showDownloadMessage(`🔍 [DEBUG] Scanning first 3 PDFs only for debugging...`, 'info');
  
  // DEBUG: Scan only the first 3 PDFs
  const maxScans = Math.min(3, allPDFs.length);
  for (let i = 0; i < maxScans; i++) {
    console.log(`\n--- [DEBUG] Scanning PDF ${i + 1}/${maxScans} (first 3 only) ---`);
    
    const pdfInfo = await scanSinglePDF(allPDFs[i], i);
    if (pdfInfo && pdfInfo.downloadCount >= 5) {
      eligiblePDFs.push(pdfInfo);
      console.log(`✅ Added eligible PDF: ${pdfInfo.fileName} (${pdfInfo.downloadCount} downloads)`);
    }
    
    // Add delay between scans
    if (i < maxScans - 1) {
      console.log(`⏸️ Waiting before next scan...`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log(`\n🎯 [DEBUG] Scan complete! Found ${eligiblePDFs.length} eligible PDFs (first 3 PDFs only)`);
  
  return eligiblePDFs;
}

// Function to scan all PDFs and return results for popup
async function scanAllPDFsForPopup(): Promise<{success: boolean, pdfs: any[], eligible: number}> {
  const allPDFs = detectPDFFiles();
  
  if (allPDFs.length === 0) {
    return { success: false, pdfs: [], eligible: 0 };
  }
  
  console.log(`🔍 [DEBUG] Starting popup scan of FIRST 3 PDFs only (out of ${allPDFs.length} total) for debugging...`);
  
  const scannedPDFs: any[] = [];
  let eligibleCount = 0;
  
  // DEBUG: Scan only the first 3 PDFs
  const maxScans = Math.min(3, allPDFs.length);
  for (let i = 0; i < maxScans; i++) {
    console.log(`\n--- [DEBUG] Scanning PDF ${i + 1}/${maxScans} (first 3 only) for popup ---`);
    
    const pdfInfo = await scanSinglePDF(allPDFs[i], i);
    
    if (pdfInfo) {
      scannedPDFs.push({
        fileName: pdfInfo.fileName,
        downloadCount: pdfInfo.downloadCount,
        uploadDate: pdfInfo.uploadDate,
        index: i
      });
      
      if (pdfInfo.downloadCount >= 5) {
        eligibleCount++;
      }
    } else {
      // Add PDF with 0 downloads if scan failed
      const fileName = allPDFs[i].querySelector('.file-name')?.textContent?.trim() || '';
      scannedPDFs.push({
        fileName: fileName,
        downloadCount: 0,
        uploadDate: '',
        index: i
      });
    }
    
    // Add delay between scans
    if (i < maxScans - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log(`🎯 [DEBUG] Popup scan complete! Found ${scannedPDFs.length} PDFs, ${eligibleCount} eligible (first 3 PDFs only)`);
  
  return { 
    success: true, 
    pdfs: scannedPDFs, 
    eligible: eligibleCount 
  };
}

// Function to scan all PDFs and return results for popup with incremental updates
async function scanAllPDFsWithProgress(): Promise<{success: boolean, pdfs: any[], eligible: number}> {
  const allPDFs = detectPDFFiles();
  
  if (allPDFs.length === 0) {
    return { success: false, pdfs: [], eligible: 0 };
  }
  
  console.log(`🔍 [DEBUG] Starting progressive popup scan of FIRST 3 PDFs only (out of ${allPDFs.length} total) for debugging...`);
  
  const scannedPDFs: any[] = [];
  let eligibleCount = 0;
  const maxScans = Math.min(3, allPDFs.length);
  
  // Send initial scan start message
  chrome.runtime.sendMessage({
    action: 'scanProgress',
    type: 'start',
    total: maxScans, // DEBUG: Only 3 PDFs
    scanned: 0,
    eligible: 0,
    pdfs: []
  });
  
  // DEBUG: Scan only the first 3 PDFs
  for (let i = 0; i < maxScans; i++) {
    console.log(`\n--- [DEBUG] Scanning PDF ${i + 1}/${maxScans} (first 3 only) for progressive update ---`);
    
    const pdfInfo = await scanSinglePDF(allPDFs[i], i);
    
    if (pdfInfo) {
      scannedPDFs.push({
        fileName: pdfInfo.fileName,
        downloadCount: pdfInfo.downloadCount,
        uploadDate: pdfInfo.uploadDate,
        index: i
      });
      
      if (pdfInfo.downloadCount >= 5) {
        eligibleCount++;
      }
    } else {
      // Add PDF with 0 downloads if scan failed
      const fileName = allPDFs[i].querySelector('.file-name')?.textContent?.trim() || '';
      scannedPDFs.push({
        fileName: fileName,
        downloadCount: 0,
        uploadDate: '',
        index: i
      });
    }
    
    // Send progress update after each PDF
    chrome.runtime.sendMessage({
      action: 'scanProgress',
      type: 'progress',
      total: maxScans, // DEBUG: Only 3 PDFs
      scanned: i + 1,
      eligible: eligibleCount,
      pdfs: [...scannedPDFs], // Send copy of current results
      currentPdf: scannedPDFs[scannedPDFs.length - 1]
    });
    
    // Add delay between scans
    if (i < maxScans - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // Send final completion message
  chrome.runtime.sendMessage({
    action: 'scanProgress',
    type: 'complete',
    total: maxScans, // DEBUG: Only 3 PDFs
    scanned: maxScans,
    eligible: eligibleCount,
    pdfs: scannedPDFs
  });
  
  console.log(`🎯 [DEBUG] Progressive scan complete! Found ${scannedPDFs.length} PDFs, ${eligibleCount} eligible (first 3 PDFs only)`);
  
  return { 
    success: true, 
    pdfs: scannedPDFs, 
    eligible: eligibleCount 
  };
}

// Function to handle PDF modal interaction
function handlePDFModal() {
  const { fileName, downloadCount } = getPDFInfoFromModal();
  
  if (!fileName) {
    return;
  }

  console.log(`📄 PDF Modal detected: ${fileName} (${downloadCount} downloads)`);
  
  // Send info to background script for tracking
  chrome.runtime.sendMessage({
    action: 'trackPDFView',
    fileName: fileName,
    downloadCount: downloadCount,
    url: window.location.href
  });

  // Auto-download button in modal has been removed
  // PDFs can still be downloaded through the helper UI and popup
  if (downloadCount >= 5) {
    console.log(`✅ PDF "${fileName}" has ${downloadCount} downloads, eligible for auto-download`);
    // addAutoDownloadButton call removed - no auto-download button in modal
  }
}

// Function to add auto-download button to modal
function addAutoDownloadButton(originalButton: HTMLElement, fileName: string, downloadCount: number) {
  // Check if auto-download button already exists
  if (document.querySelector('.kp-auto-download')) {
    return;
  }

  const autoDownloadButton = document.createElement('div');
  autoDownloadButton.className = 'kp-auto-download';
  autoDownloadButton.innerHTML = `
    <div style="
      background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
      color: white;
      padding: 8px 16px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
      margin: 10px 0;
      text-align: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      transition: all 0.3s ease;
    ">
      🚀 Auto Download (${downloadCount} downloads)
    </div>
  `;

  // Insert after the original download button
  originalButton.parentNode?.insertBefore(autoDownloadButton, originalButton.nextSibling);

  // Add click handler
  autoDownloadButton.addEventListener('click', () => {
    console.log(`🚀 Auto-download clicked for: ${fileName}`);
    
    try {
      // Show starting message
      showDownloadMessage(`🚀 Starting download: ${fileName}`, 'info');
      
      // Trigger the original download
      console.log('📱 Clicking original download button...');
      originalButton.click();
      
      // Send download message to background
      chrome.runtime.sendMessage({
        action: 'downloadPDF',
        fileName: fileName,
        downloadCount: downloadCount,
        url: window.location.href
      }).then((response) => {
        console.log('📨 Background response:', response);
        if (response && response.success) {
          showDownloadMessage(`✅ Download started: ${fileName}`, 'success');
        } else {
          showDownloadMessage(`⚠️ Download may have failed: ${fileName}`, 'warning');
        }
       }).catch((error) => {
         console.error('❌ Background message error:', error);
         const errorMessage = error instanceof Error ? error.message : 'Unknown error';
         showDownloadMessage(`❌ Extension error: ${errorMessage}`, 'warning');
       });
      
    } catch (error) {
      console.error('❌ Auto-download error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showDownloadMessage(`❌ Download failed: ${errorMessage}`, 'warning');
    }
  });

  // Add hover effect
  autoDownloadButton.addEventListener('mouseenter', () => {
    (autoDownloadButton.firstElementChild as HTMLElement).style.transform = 'translateY(-2px)';
  });

  autoDownloadButton.addEventListener('mouseleave', () => {
    (autoDownloadButton.firstElementChild as HTMLElement).style.transform = 'translateY(0)';
  });
}

// Function to show download message
function showDownloadMessage(message: string, type: 'success' | 'info' | 'warning' = 'info') {
  const colors = {
    success: { bg: 'rgba(76, 175, 80, 0.9)', border: '#4CAF50' },
    info: { bg: 'rgba(33, 150, 243, 0.9)', border: '#2196F3' },
    warning: { bg: 'rgba(255, 152, 0, 0.9)', border: '#ff9800' }
  };

  const notification = document.createElement('div');
  notification.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${colors[type].bg};
      color: white;
      padding: 15px 20px;
      border-radius: 10px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 10001;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border-left: 4px solid ${colors[type].border};
    ">
      ${message}
    </div>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Function to create PDF helper UI for eligible PDFs only
function createPDFHelper(eligiblePDFs: PDFInfo[]) {
  if (eligiblePDFs.length === 0) {
    showDownloadMessage('📄 No PDFs with 5+ downloads found', 'warning');
    return;
  }
  
  // Remove existing helper if present
  const existingHelper = document.getElementById('kp-pdf-helper');
  if (existingHelper) {
    existingHelper.remove();
  }
  
  const helperDiv = document.createElement('div');
  helperDiv.id = 'kp-pdf-helper';
  helperDiv.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
      color: white;
      padding: 20px;
      border-radius: 10px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      max-width: 380px;
      max-height: 500px;
      overflow-y: auto;
    ">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <strong>✅ Eligible PDFs: ${eligiblePDFs.length}</strong>
        <button id="kp-close-helper" style="
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
      <div style="font-size: 11px; opacity: 0.9; margin-bottom: 15px;">
        PDFs with 5+ downloads - Click to open and auto-download
      </div>
      <div id="kp-pdf-list" style="margin-bottom: 15px;">
        ${eligiblePDFs.map((pdfInfo, index) => {
          const shortName = pdfInfo.fileName.length > 30 ? pdfInfo.fileName.substring(0, 30) + '...' : pdfInfo.fileName;
          return `
            <div style="
              padding: 10px;
              margin: 8px 0;
              background: rgba(255,255,255,0.1);
              border-radius: 5px;
              font-size: 12px;
              cursor: pointer;
              transition: all 0.3s ease;
              border-left: 3px solid #fff;
            " class="kp-pdf-item" data-index="${index}">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${pdfInfo.fileName}">
                  📄 ${shortName}
                </span>
                <span style="
                  background: rgba(255,255,255,0.2);
                  padding: 2px 6px;
                  border-radius: 10px;
                  font-size: 10px;
                  margin-left: 8px;
                ">
                  ${pdfInfo.downloadCount}x
                </span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div style="text-align: center; font-size: 11px; opacity: 0.8;">
        Knowledge Planet Helper - Auto Download Ready
      </div>
    </div>
  `;
  
  document.body.appendChild(helperDiv);
  
  // Add event listeners
  const closeBtn = document.getElementById('kp-close-helper');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      helperDiv.remove();
    });
  }
  
  // Add PDF item click listeners
  const pdfItemElements = document.querySelectorAll('.kp-pdf-item');
  pdfItemElements.forEach((item, index) => {
    item.addEventListener('click', () => {
      // Trigger click on the actual PDF item
      eligiblePDFs[index].element.click();
      
      // Close the helper
      helperDiv.remove();
      
      // Wait for modal to open and then handle it
      setTimeout(handlePDFModal, 500);
    });
    
    // Add hover effect
    item.addEventListener('mouseenter', () => {
      (item as HTMLElement).style.background = 'rgba(255,255,255,0.2)';
      (item as HTMLElement).style.transform = 'translateY(-2px)';
    });
    
    item.addEventListener('mouseleave', () => {
      (item as HTMLElement).style.background = 'rgba(255,255,255,0.1)';
      (item as HTMLElement).style.transform = 'translateY(0)';
    });
  });
}

// Function to scan for eligible PDFs and show helper
async function scanForPDFs() {
  console.log('🔍 Starting PDF scan for eligible downloads...');
  
  const eligiblePDFs = await scanAllPDFs();
  
  if (eligiblePDFs.length > 0) {
    console.log(`✅ Found ${eligiblePDFs.length} eligible PDFs for auto-download`);
    createPDFHelper(eligiblePDFs);
    showDownloadMessage(`✅ Found ${eligiblePDFs.length} PDFs ready for auto-download`, 'success');
  } else {
    console.log('❌ No eligible PDFs found (need 5+ downloads)');
    showDownloadMessage('📄 No PDFs with 5+ downloads found on this page', 'warning');
  }
}

// Function to observe for modal changes
function observeModalChanges() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            // Check if a PDF preview modal was added
            if (element.matches && element.matches('app-file-preview')) {
              setTimeout(handlePDFModal, 100);
            } else if (element.querySelector && element.querySelector('app-file-preview')) {
              setTimeout(handlePDFModal, 100);
            }
          }
        });
      }
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Initialize when page loads
function initialize() {
  // Only observe for PDF modal changes, don't auto-scan
  observeModalChanges();
  
  console.log('📋 Knowledge Planet Helper initialized. Click "Scan Current Page" to find PDFs.');
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scanPDFs') {
    scanForPDFs();
    sendResponse({ status: 'PDF scan completed!' });
  } else if (request.action === 'scanPDFsWithResults') {
    // Perform scan and return results with download counts
    scanAllPDFsForPopup().then((results) => {
      sendResponse(results);
    });
    return true; // Keep the message channel open for async response
  } else if (request.action === 'scanPDFsWithProgress') {
    // Perform progressive scan with real-time updates
    scanAllPDFsWithProgress().then((results) => {
      sendResponse(results);
    });
    return true; // Keep the message channel open for async response
  } else if (request.action === 'getPDFData') {
    const allPDFs = detectPDFFiles();
    const pdfData = allPDFs.map((element, index) => ({
      element: null, // Can't send DOM elements
      fileName: element.querySelector('.file-name')?.textContent?.trim() || '',
      downloadCount: 0, // Will be filled after scanning
      index: index
    }));
    sendResponse({ pdfs: pdfData });
  } else if (request.action === 'downloadPDF') {
    const allPDFs = detectPDFFiles();
    if (allPDFs[request.pdfIndex]) {
      allPDFs[request.pdfIndex].click();
      // Wait for modal to open, then trigger download
      setTimeout(() => {
        const downloadButton = document.querySelector('app-file-preview .download') as HTMLElement;
        if (downloadButton) {
          downloadButton.click();
        }
      }, 1000);
    }
    sendResponse({ status: 'PDF download triggered' });
  }
});

// Send initialization message to background script
chrome.runtime.sendMessage({ 
  action: 'contentScriptLoaded', 
  url: window.location.href 
});

// Function to create download button for PDF item
function createAutoDownloadButton(pdfInfo: PDFInfo): HTMLElement {
  const autoDownloadBtn = document.createElement('button');
  autoDownloadBtn.className = 'auto-download-btn';
  autoDownloadBtn.innerHTML = '⬇️ Auto Download';
  autoDownloadBtn.style.cssText = `
    background: #4CAF50;
    color: white;
    border: none;
    padding: 5px 10px;
    margin: 5px 0;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    width: 100%;
  `;
  
  autoDownloadBtn.onclick = async (e) => {
    e.stopPropagation();
    console.log(`🔽 Auto-downloading PDF: ${pdfInfo.fileName}`);
    
    // Click the PDF to open modal
    pdfInfo.element.click();
    
    // Wait for modal to load
    await waitForModalContent();
    
    // Find and click download button
    const downloadButton = document.querySelector('app-file-preview .download') as HTMLElement;
    if (downloadButton) {
      downloadButton.click();
      showDownloadMessage(`✅ Downloaded: ${pdfInfo.fileName}`, 'success');
      
      // Close the modal
      setTimeout(() => {
        closeModal();
      }, 500);
    } else {
      showDownloadMessage(`❌ Could not find download button for: ${pdfInfo.fileName}`, 'warning');
    }
  };
  
  return autoDownloadBtn;
} 