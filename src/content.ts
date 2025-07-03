/// <reference types="chrome"/>

// Content script for Knowledge Planet Helper
console.log('Knowledge Planet Helper: Content script loaded! 🎯');

// Track ongoing downloads to prevent duplicates
let ongoingDownloads: Set<string> = new Set();

// Sequential download queue system
interface DownloadTask {
  pdfIndex: number;
  expectedFileName: string;
  downloadCount: number;
  retryCount?: number;
}

class DownloadQueue {
  private queue: DownloadTask[] = [];
  private isProcessing = false;
  private maxRetries = 2;
  private downloadDelay = 3000; // 3 seconds between downloads

  add(task: DownloadTask) {
    console.log(`📥 Adding to download queue: "${task.expectedFileName}" (${task.downloadCount} downloads)`);
    this.queue.push({ ...task, retryCount: 0 });
    this.process();
  }

  private async process() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    console.log(`🔄 Processing download queue (${this.queue.length} items remaining)`);

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      const success = await this.downloadSinglePDF(task);
      
      if (!success && task.retryCount! < this.maxRetries) {
        // Retry failed download
        task.retryCount = (task.retryCount || 0) + 1;
        console.log(`🔄 Retrying download (${task.retryCount}/${this.maxRetries}): "${task.expectedFileName}"`);
        this.queue.unshift(task); // Add back to front of queue
        await this.delay(1000); // Short delay before retry
      } else if (!success) {
        console.error(`❌ Failed to download after ${this.maxRetries} retries: "${task.expectedFileName}"`);
        // Send failure notification
        chrome.runtime.sendMessage({
          action: 'downloadFailed',
          fileName: task.expectedFileName,
          reason: 'Max retries exceeded'
        });
      }

      // Delay between downloads to prevent overwhelming the system
      if (this.queue.length > 0) {
        console.log(`⏱️ Waiting ${this.downloadDelay}ms before next download...`);
        await this.delay(this.downloadDelay);
      }
    }

    this.isProcessing = false;
    console.log('✅ Download queue processing complete');
  }

  private async downloadSinglePDF(task: DownloadTask): Promise<boolean> {
    try {
      console.log(`📥 Sequential download: "${task.expectedFileName}" (index: ${task.pdfIndex})`);
      
      const allPDFs = detectPDFFiles();
      let targetElement: HTMLElement | undefined = allPDFs[task.pdfIndex];
      
      // Verify filename matches to prevent race condition
      if (targetElement && task.expectedFileName) {
        const actualFileName = targetElement.querySelector('.file-name')?.textContent?.trim();
        
        if (actualFileName !== task.expectedFileName) {
          console.warn(`⚠️ PDF order changed! Expected: "${task.expectedFileName}", Got: "${actualFileName}"`);
          
          // Find correct PDF by filename
          targetElement = allPDFs.find(pdf => 
            pdf.querySelector('.file-name')?.textContent?.trim() === task.expectedFileName
          );
          
          if (!targetElement) {
            console.error(`❌ Could not find PDF with filename: "${task.expectedFileName}"`);
            return false;
          }
        }
      }

      if (!targetElement) {
        console.error(`❌ No target element found for PDF: "${task.expectedFileName}"`);
        return false;
      }

      // Check if already downloading
      const downloadKey = `${task.expectedFileName}_${task.downloadCount}`;
      if (ongoingDownloads.has(downloadKey)) {
        console.log(`⚠️ Download already in progress, skipping: ${task.expectedFileName}`);
        return true; // Consider this a success to avoid retry
      }

      // Mark as ongoing
      ongoingDownloads.add(downloadKey);

      try {
        // Click the PDF element
        console.log(`📱 Clicking PDF element: "${task.expectedFileName}"`);
        targetElement.click();
        
        // Wait for modal to open
        await this.delay(2000);
        const modalLoaded = await waitForModalContent();
        
        if (!modalLoaded) {
          console.error(`❌ Modal failed to load for: "${task.expectedFileName}"`);
          return false;
        }

        // Get PDF info from the modal to verify
        const { fileName, uploadDate, downloadCount } = getPDFInfoFromModal();
        
        if (fileName !== task.expectedFileName) {
          console.error(`❌ Modal filename mismatch! Expected: "${task.expectedFileName}", Got: "${fileName}"`);
          await closeModal();
          return false;
        }

        // Register download metadata
        chrome.runtime.sendMessage({
          action: 'registerDownload',
          fileName: fileName,
          uploadDate: uploadDate,
          downloadCount: downloadCount
        });

        // Click download button
        const downloadButton = document.querySelector('app-file-preview .download') as HTMLElement;
        if (!downloadButton) {
          console.error(`❌ Download button not found for: "${task.expectedFileName}"`);
          await closeModal();
          return false;
        }

        console.log(`⬇️ Clicking download button for: "${task.expectedFileName}"`);
        downloadButton.click();

        // Wait for download to start
        await this.delay(1000);

        // Close modal
        await closeModal();
        await waitForModalToClose();

        console.log(`✅ Successfully downloaded: "${task.expectedFileName}"`);
        
        // Send success notification
        chrome.runtime.sendMessage({
          action: 'downloadSuccess',
          fileName: task.expectedFileName,
          downloadCount: task.downloadCount
        });

        return true;

      } finally {
        // Always remove from ongoing downloads
        setTimeout(() => {
          ongoingDownloads.delete(downloadKey);
        }, 2000);
      }

    } catch (error) {
      console.error(`❌ Error downloading "${task.expectedFileName}":`, error);
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  clear() {
    this.queue = [];
    this.isProcessing = false;
    console.log('🧹 Download queue cleared');
  }
}

// Global download queue instance
const downloadQueue = new DownloadQueue();

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
      console.log(`📱 [${pdfIndex + 1}] Clicking PDF element...`);
      
      // Single click method - most reliable
      pdfElement.click();
      
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

// Function to scan all PDFs and return results for popup
async function scanAllPDFsForPopup(): Promise<{success: boolean, pdfs: any[], eligible: number}> {
  const allPDFs = detectPDFFiles();
  
  if (allPDFs.length === 0) {
    return { success: false, pdfs: [], eligible: 0 };
  }
  
  console.log(`🔍 [DEBUG] Starting popup scan of FIRST 10 PDFs only (out of ${allPDFs.length} total) for debugging...`);
  
  const scannedPDFs: any[] = [];
  let eligibleCount = 0;
  
  // DEBUG: Scan only the first 10 PDFs
  const maxScans = Math.min(10, allPDFs.length);
  for (let i = 0; i < maxScans; i++) {
    console.log(`\n--- [DEBUG] Scanning PDF ${i + 1}/${maxScans} (first 10 only) for popup ---`);
    
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
  
  console.log(`🎯 [DEBUG] Popup scan complete! Found ${scannedPDFs.length} PDFs, ${eligibleCount} eligible (first 10 PDFs only)`);
  
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
  
  console.log(`🔍 [DEBUG] Starting progressive popup scan of FIRST 10 PDFs only (out of ${allPDFs.length} total) for debugging...`);
  
  const scannedPDFs: any[] = [];
  let eligibleCount = 0;
  const maxScans = Math.min(10, allPDFs.length);
  
  // Send initial scan start message
  chrome.runtime.sendMessage({
    action: 'scanProgress',
    type: 'start',
    total: maxScans, // DEBUG: Only 10 PDFs
    scanned: 0,
    eligible: 0,
    pdfs: []
  });
  
  // DEBUG: Scan only the first 10 PDFs
  for (let i = 0; i < maxScans; i++) {
    console.log(`\n--- [DEBUG] Scanning PDF ${i + 1}/${maxScans} (first 10 only) for progressive update ---`);
    
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
      total: maxScans, // DEBUG: Only 10 PDFs
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
    total: maxScans, // DEBUG: Only 10 PDFs
    scanned: maxScans,
    eligible: eligibleCount,
    pdfs: scannedPDFs
  });
  
  console.log(`🎯 [DEBUG] Progressive scan complete! Found ${scannedPDFs.length} PDFs, ${eligibleCount} eligible (first 10 PDFs only)`);
  
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

  // Auto-download button completely disabled - using popup-based downloads only
  if (downloadCount >= 5) {
    console.log(`✅ PDF "${fileName}" has ${downloadCount} downloads, eligible for popup download`);
    // All downloads now happen through popup interface to prevent duplicate events
  }
}

// Auto-download button functionality removed - all downloads now happen through popup interface

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

// Initialize when page loads
function initialize() {
  // Modal observation disabled to prevent duplicate downloads
  // All downloads now happen through popup interface only
  
  console.log('📋 Knowledge Planet Helper initialized. Use popup to scan and download PDFs.');
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'scanPDFs') {
    console.log('📄 PDF scan disabled - use popup instead');
    sendResponse({ status: 'PDF scan disabled - use popup instead!' });
    return false;
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
    return false;
  } else if (request.action === 'downloadPDF') {
    console.log(`📥 Download request received for: "${request.expectedFileName}" (index: ${request.pdfIndex})`);
    
    // Add to download queue for sequential processing
    downloadQueue.add({
      pdfIndex: request.pdfIndex,
      expectedFileName: request.expectedFileName,
      downloadCount: request.downloadCount || 0
    });
    
    sendResponse({ 
      status: 'PDF added to download queue',
      queueLength: downloadQueue.getQueueLength()
    });
    return false;
  } else if (request.action === 'downloadMultiplePDFs') {
    console.log(`📥 Bulk download request received for ${request.pdfs.length} PDFs`);
    
    // Clear any existing queue first
    downloadQueue.clear();
    
    // Add all eligible PDFs to the queue
    request.pdfs.forEach((pdf: any) => {
      if (pdf.downloadCount >= 5) {
        downloadQueue.add({
          pdfIndex: pdf.index,
          expectedFileName: pdf.fileName,
          downloadCount: pdf.downloadCount
        });
      }
    });
    
    sendResponse({ 
      status: `${downloadQueue.getQueueLength()} PDFs added to download queue`,
      queueLength: downloadQueue.getQueueLength()
    });
    return false;
  } else if (request.action === 'clearDownloadQueue') {
    downloadQueue.clear();
    sendResponse({ status: 'Download queue cleared' });
    return false;
  } else if (request.action === 'getQueueStatus') {
    sendResponse({ 
      queueLength: downloadQueue.getQueueLength(),
      isProcessing: downloadQueue.getQueueLength() > 0
    });
    return false;
  } else {
    console.log('❓ Unknown action:', request.action);
    return false;
  }
});

// Send initialization message to background script
chrome.runtime.sendMessage({ 
  action: 'contentScriptLoaded', 
  url: window.location.href 
});

 