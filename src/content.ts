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
        // Wait for modal to be fully loaded before extracting info
        const modalLoaded = await waitForModalContent();
        if (!modalLoaded) {
          console.error(`❌ Modal failed to load for: "${task.expectedFileName}"`);
          return false;
        }
        // Wait a short time to ensure content is stable
        await new Promise(resolve => setTimeout(resolve, 200));
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
    const modal = document.querySelector('app-file-preview');
    if (!modal) {
      // Wait for modal to appear
      const observer = new MutationObserver((mutations, obs) => {
        const modalNow = document.querySelector('app-file-preview');
        if (modalNow) {
          obs.disconnect();
          // Now observe content inside modal
          observeModalContent(modalNow as HTMLElement, resolve);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      // Modal already exists, observe its content
      observeModalContent(modal as HTMLElement, resolve);
    }

    function observeModalContent(modalElem: HTMLElement, done: (result: boolean) => void) {
      // Check if content is already loaded
      if (isModalReady(modalElem)) {
        done(true);
        return;
      }
      const contentObserver = new MutationObserver(() => {
        if (isModalReady(modalElem)) {
          contentObserver.disconnect();
          done(true);
        }
      });
      contentObserver.observe(modalElem, { childList: true, subtree: true, characterData: true });
    }
    function isModalReady(modalElem: HTMLElement): boolean {
      const fileName = modalElem.querySelector('.file-name');
      const downloadRecord = modalElem.querySelector('.download-record');
      const textContent = modalElem.textContent || '';
      return !!fileName && !!downloadRecord && textContent.trim().length > 10;
    }
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
    // Click the PDF element
    pdfElement.click();
    // Wait for modal to be fully loaded before extracting info
    waitForModalContent().then(async (modalLoaded) => {
      if (modalLoaded) {
        // Wait a short time to ensure content is stable
        await new Promise(resolve => setTimeout(resolve, 200));
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
          // Always return the PDF info with actual download count
          resolve({
            element: pdfElement,
            fileName,
            downloadCount,
            uploadDate,
            index: pdfIndex
          });
          console.log(`📊 [${pdfIndex + 1}] PDF "${fileName}" has ${downloadCount} downloads ${downloadCount >= 5 ? '(eligible)' : '(not eligible)'}`);
        } else {
          console.warn(`⚠️ [${pdfIndex + 1}] Modal filename mismatch! Expected: ${fileName}, Got: ${modalFileName}`);
          await closeModal();
          await waitForModalToClose();
          resolve(null);
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
        resolve(null);
      }
    });
  });
}

// Function to scan all PDFs and return results for popup
async function scanAllPDFsForPopup(scanDays: number = 1, customDate: string | null = null): Promise<{success: boolean, pdfs: any[], eligible: number}> {
  let scanDescription: string;
  if (customDate) {
    scanDescription = `since ${customDate}`;
  } else {
    scanDescription = scanDays === 1 ? 'today' : `last ${scanDays} days`;
  }
  console.log(`🔍 Starting popup scan with content loading (${scanDescription})...`);
  
  // First scroll down to load all content
  await scrollToLoadAllContent();
  console.log('✅ Finished scrolling, now scanning PDFs...');
  
  const allPDFs = detectPDFFiles();
  
  if (allPDFs.length === 0) {
    return { success: false, pdfs: [], eligible: 0 };
  }
  
  console.log(`🔍 Starting popup scan of ${allPDFs.length} PDFs (${scanDescription})...`);
  
  const scannedPDFs: any[] = [];
  let eligibleCount = 0;
  
  // Scan all PDFs found on the page
  for (let i = 0; i < allPDFs.length; i++) {
    console.log(`\n--- Scanning PDF ${i + 1}/${allPDFs.length} for popup ---`);
    
    const pdfInfo = await scanSinglePDF(allPDFs[i], i);
    
    if (pdfInfo) {
      // Include PDFs based on scan range or custom date
      let isInRange: boolean;
      if (customDate) {
        isInRange = isSinceCustomDate(pdfInfo.uploadDate, customDate);
      } else {
        isInRange = scanDays === 1 ? isToday(pdfInfo.uploadDate) : isWithinLastDays(pdfInfo.uploadDate, scanDays);
      }
      
      if (isInRange) {
        scannedPDFs.push({
          fileName: pdfInfo.fileName,
          downloadCount: pdfInfo.downloadCount,
          uploadDate: pdfInfo.uploadDate,
          index: i
        });
        
        if (pdfInfo.downloadCount >= 5) {
          eligibleCount++;
        }
        console.log(`✅ PDF "${pdfInfo.fileName}" uploaded within ${scanDescription} (${pdfInfo.uploadDate}) - ${pdfInfo.downloadCount} downloads`);
      } else {
        console.log(`⏹️ Stopping scan - found PDF "${pdfInfo.fileName}" not within ${scanDescription} (${pdfInfo.uploadDate})`);
        console.log(`📋 Files are ordered by date, so all remaining files will be older`);
        break; // Stop scanning since files are ordered by date
      }
    } else {
      // Add PDF with 0 downloads if scan failed, but only if uploaded within range
      const fileName = allPDFs[i].querySelector('.file-name')?.textContent?.trim() || '';
      // Note: We can't determine upload date for failed scans, so we'll skip them
      console.log(`❌ Failed to scan PDF "${fileName}" - skipping`);
    }
    
    // Add delay between scans
    if (i < allPDFs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log(`🎯 Popup scan complete! Found ${scannedPDFs.length} PDFs from ${scanDescription}, ${eligibleCount} eligible`);
  
  return { 
    success: true, 
    pdfs: scannedPDFs, 
    eligible: eligibleCount 
  };
}

// Function to scan all PDFs and return results for popup with incremental updates
async function scanAllPDFsWithProgress(scanDays: number = 1, customDate: string | null = null): Promise<{success: boolean, pdfs: any[], eligible: number}> {
  let scanDescription: string;
  if (customDate) {
    scanDescription = `since ${customDate}`;
  } else {
    scanDescription = scanDays === 1 ? 'today' : `last ${scanDays} days`;
  }
  console.log(`🔍 Starting progressive popup scan with content loading (${scanDescription})...`);
  
  // First scroll down to load all content
  await scrollToLoadAllContent();
  console.log('✅ Finished scrolling, now scanning PDFs...');
  
  const allPDFs = detectPDFFiles();
  
  if (allPDFs.length === 0) {
    return { success: false, pdfs: [], eligible: 0 };
  }
  
  console.log(`🔍 Starting progressive popup scan of ${allPDFs.length} PDFs (${scanDescription})...`);
  
  const scannedPDFs: any[] = [];
  let eligibleCount = 0;
  
  // Send initial scan start message
  chrome.runtime.sendMessage({
    action: 'scanProgress',
    type: 'start',
    total: allPDFs.length,
    scanned: 0,
    eligible: 0,
    pdfs: [],
    scanDays: scanDays
  });
  
  // Scan all PDFs found on the page
  for (let i = 0; i < allPDFs.length; i++) {
    console.log(`\n--- Scanning PDF ${i + 1}/${allPDFs.length} for progressive update ---`);
    
    const pdfInfo = await scanSinglePDF(allPDFs[i], i);
    
    if (pdfInfo) {
      // Include PDFs based on scan range or custom date
      let isInRange: boolean;
      if (customDate) {
        isInRange = isSinceCustomDate(pdfInfo.uploadDate, customDate);
      } else {
        isInRange = scanDays === 1 ? isToday(pdfInfo.uploadDate) : isWithinLastDays(pdfInfo.uploadDate, scanDays);
      }
      
      if (isInRange) {
        scannedPDFs.push({
          fileName: pdfInfo.fileName,
          downloadCount: pdfInfo.downloadCount,
          uploadDate: pdfInfo.uploadDate,
          index: i
        });
        
        if (pdfInfo.downloadCount >= 5) {
          eligibleCount++;
        }
        console.log(`✅ PDF "${pdfInfo.fileName}" uploaded within ${scanDescription} (${pdfInfo.uploadDate}) - ${pdfInfo.downloadCount} downloads`);
      } else {
        console.log(`⏹️ Stopping scan - found PDF "${pdfInfo.fileName}" not within ${scanDescription} (${pdfInfo.uploadDate})`);
        console.log(`📋 Files are ordered by date, so all remaining files will be older`);
        break; // Stop scanning since files are ordered by date
      }
    } else {
      // Add PDF with 0 downloads if scan failed, but only if uploaded within range
      const fileName = allPDFs[i].querySelector('.file-name')?.textContent?.trim() || '';
      // Note: We can't determine upload date for failed scans, so we'll skip them
      console.log(`❌ Failed to scan PDF "${fileName}" - skipping`);
    }
    
    // Send progress update after each PDF
    chrome.runtime.sendMessage({
      action: 'scanProgress',
      type: 'progress',
      total: allPDFs.length,
      scanned: i + 1,
      eligible: eligibleCount,
      pdfs: [...scannedPDFs], // Send copy of current results
      currentPdf: scannedPDFs[scannedPDFs.length - 1],
      scanDays: scanDays
    });
    
    // Add delay between scans
    if (i < allPDFs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // Send final completion message
  chrome.runtime.sendMessage({
    action: 'scanProgress',
    type: 'complete',
    total: allPDFs.length,
    scanned: allPDFs.length,
    eligible: eligibleCount,
    pdfs: scannedPDFs,
    scanDays: scanDays
  });
  
  console.log(`🎯 Progressive scan complete! Found ${scannedPDFs.length} PDFs from ${scanDescription}, ${eligibleCount} eligible`);
  
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
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scanPDFs') {
    console.log('📄 PDF scan disabled - use popup instead');
    sendResponse({ status: 'PDF scan disabled - use popup instead!' });
  } else if (request.action === 'scanPDFsWithResults') {
    // Perform scan and return results with download counts
    const scanDays = request.scanDays || 1; // Default to today if not specified
    const customDate = request.customDate || null; // Custom date if provided
    scanAllPDFsForPopup(scanDays, customDate).then((results) => {
      sendResponse(results);
    });
    return true; // Keep the message channel open for async response
  } else if (request.action === 'scanPDFsWithProgress') {
    // Perform progressive scan with real-time updates
    const scanDays = request.scanDays || 1; // Default to today if not specified
    const customDate = request.customDate || null; // Custom date if provided
    scanAllPDFsWithProgress(scanDays, customDate).then((results) => {
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
  } else if (request.action === 'clearDownloadQueue') {
    downloadQueue.clear();
    sendResponse({ status: 'Download queue cleared' });
  } else if (request.action === 'getQueueStatus') {
    sendResponse({ 
      queueLength: downloadQueue.getQueueLength(),
      isProcessing: downloadQueue.getQueueLength() > 0
    });
  }
});

// Send initialization message to background script
chrome.runtime.sendMessage({ 
  action: 'contentScriptLoaded', 
  url: window.location.href 
});

// Function to check if a date string represents today
function isToday(dateString: string): boolean {
  if (!dateString) return false;
  
  try {
    // Parse the date string (assuming format like "2025-07-18" or "2025-07-18 00:28")
    const dateParts = dateString.split(' ')[0].split('-');
    if (dateParts.length !== 3) return false;
    
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed
    const day = parseInt(dateParts[2]);
    
    const uploadDate = new Date(year, month, day);
    const today = new Date();
    
    return uploadDate.getFullYear() === today.getFullYear() &&
           uploadDate.getMonth() === today.getMonth() &&
           uploadDate.getDate() === today.getDate();
  } catch (error) {
    console.warn('Error parsing date:', dateString, error);
    return false;
  }
}

// Function to check if a date string is within the last N days
function isWithinLastDays(dateString: string, days: number): boolean {
  if (!dateString) return false;
  
  try {
    // Parse the date string (assuming format like "2025-07-18" or "2025-07-18 00:28")
    const dateParts = dateString.split(' ')[0].split('-');
    if (dateParts.length !== 3) return false;
    
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed
    const day = parseInt(dateParts[2]);
    
    const uploadDate = new Date(year, month, day);
    const today = new Date();
    
    // Calculate the date N days ago
    const daysAgo = new Date(today);
    daysAgo.setDate(today.getDate() - days + 1); // +1 because we want to include today
    
    // Reset time to start of day for accurate comparison
    uploadDate.setHours(0, 0, 0, 0);
    daysAgo.setHours(0, 0, 0, 0);
    
    return uploadDate >= daysAgo;
  } catch (error) {
    console.warn('Error parsing date:', dateString, error);
    return false;
  }
}

// Function to check if a date string is since a custom date
function isSinceCustomDate(dateString: string, customDate: string): boolean {
  if (!dateString || !customDate) return false;
  
  try {
    // Parse the upload date string (assuming format like "2025-07-18" or "2025-07-18 00:28")
    const uploadDateParts = dateString.split(' ')[0].split('-');
    if (uploadDateParts.length !== 3) return false;
    
    const uploadYear = parseInt(uploadDateParts[0]);
    const uploadMonth = parseInt(uploadDateParts[1]) - 1; // Month is 0-indexed
    const uploadDay = parseInt(uploadDateParts[2]);
    
    const uploadDate = new Date(uploadYear, uploadMonth, uploadDay);
    
    // Parse the custom date (format: "YYYY-MM-DD")
    const customDateParts = customDate.split('-');
    if (customDateParts.length !== 3) return false;
    
    const customYear = parseInt(customDateParts[0]);
    const customMonth = parseInt(customDateParts[1]) - 1; // Month is 0-indexed
    const customDay = parseInt(customDateParts[2]);
    
    const sinceDate = new Date(customYear, customMonth, customDay);
    
    // Reset time to start of day for accurate comparison
    uploadDate.setHours(0, 0, 0, 0);
    sinceDate.setHours(0, 0, 0, 0);
    
    return uploadDate >= sinceDate;
  } catch (error) {
    console.warn('Error parsing dates:', dateString, customDate, error);
    return false;
  }
}

// Function to scroll down and wait for content to load
async function scrollToLoadAllContent(): Promise<void> {
  return new Promise((resolve) => {
    let lastHeight = document.body.scrollHeight;
    let scrollAttempts = 0;
    const maxScrollAttempts = 5;
    
    const scrollDown = () => {
      window.scrollTo(0, document.body.scrollHeight);
      
      setTimeout(() => {
        const newHeight = document.body.scrollHeight;
        scrollAttempts++;
        
        if (newHeight > lastHeight && scrollAttempts < maxScrollAttempts) {
          lastHeight = newHeight;
          scrollDown();
        } else {
          // Scroll back to top
          window.scrollTo(0, 0);
          setTimeout(resolve, 1000); // Wait for any final content to load
        }
      }, 2000); // Wait 2 seconds for content to load
    };
    
    scrollDown();
  });
}

 