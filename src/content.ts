/// <reference types="chrome"/>

// Content script for Knowledge Planet Helper
console.log('Knowledge Planet Helper: Content script loaded! 🎯');

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

// Function to create PDF helper UI
function createPDFHelper(pdfItems: HTMLElement[]) {
  if (pdfItems.length === 0) return;
  
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
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 10px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      max-width: 350px;
      max-height: 400px;
      overflow-y: auto;
    ">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <strong>📄 PDFs Found: ${pdfItems.length}</strong>
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
      <div id="kp-pdf-list" style="margin-bottom: 15px;">
        ${pdfItems.map((item, index) => {
          const fileName = item.querySelector('.file-name')?.textContent || `PDF ${index + 1}`;
          return `
            <div style="
              padding: 8px;
              margin: 5px 0;
              background: rgba(255,255,255,0.1);
              border-radius: 5px;
              font-size: 12px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            ">
              <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${fileName}">
                ${fileName}
              </span>
              <button class="kp-download-btn" data-index="${index}" style="
                background: rgba(255,255,255,0.3);
                border: none;
                color: white;
                padding: 4px 8px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 10px;
                margin-left: 10px;
              ">Download</button>
            </div>
          `;
        }).join('')}
      </div>
      <div style="text-align: center; font-size: 12px; opacity: 0.8;">
        Knowledge Planet Helper
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
  
  // Add download button listeners
  const downloadBtns = document.querySelectorAll('.kp-download-btn');
  downloadBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const index = parseInt((e.target as HTMLElement).getAttribute('data-index') || '0');
      downloadPDF(pdfItems[index], index);
    });
  });
}

// Function to simulate PDF download (placeholder for actual download logic)
function downloadPDF(pdfItem: HTMLElement, index: number) {
  const fileName = pdfItem.querySelector('.file-name')?.textContent || `PDF_${index + 1}.pdf`;
  
  console.log(`🎯 Attempting to download: ${fileName}`);
  
  // Show download notification
  const notification = document.createElement('div');
  notification.innerHTML = `
    <div style="
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 20px;
      border-radius: 10px;
      font-family: Arial, sans-serif;
      z-index: 10001;
      text-align: center;
    ">
      <div>📄 Download Request Sent</div>
      <div style="margin-top: 10px; font-size: 12px; opacity: 0.8;">
        ${fileName}
      </div>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Remove notification after 2 seconds
  setTimeout(() => {
    notification.remove();
  }, 2000);
  
  // TODO: Implement actual PDF download logic
  // This would typically involve:
  // 1. Finding the actual download link/URL for the PDF
  // 2. Using chrome.downloads API to download the file
  // 3. Checking download count criteria (5+ downloads)
  
  // Send message to background script
  chrome.runtime.sendMessage({
    action: 'downloadPDF',
    fileName: fileName,
    url: window.location.href
  });
}

// Function to scan for PDFs and show helper
function scanForPDFs() {
  const pdfItems = detectPDFFiles();
  
  if (pdfItems.length > 0) {
    console.log(`📄 Found ${pdfItems.length} PDF files on this page`);
    createPDFHelper(pdfItems);
  } else {
    console.log('📄 No PDF files found on this page');
    
    // Show temporary message if no PDFs found
    const noPDFsMessage = document.createElement('div');
    noPDFsMessage.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(255, 152, 0, 0.9);
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      ">
        📄 No PDFs found on this page
      </div>
    `;
    
    document.body.appendChild(noPDFsMessage);
    
    setTimeout(() => {
      noPDFsMessage.remove();
    }, 3000);
  }
}

// Initialize when page loads
function initialize() {
  // Wait a bit for the page to fully load, then scan for PDFs
  setTimeout(() => {
    scanForPDFs();
  }, 2000);
  
  // Also observe for dynamic content loading
  const observer = new MutationObserver((mutations) => {
    let shouldRescan = false;
    
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.querySelector && element.querySelector('.file-gallery-container')) {
              shouldRescan = true;
            }
          }
        });
      }
    });
    
    if (shouldRescan) {
      setTimeout(() => {
        scanForPDFs();
      }, 1000);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Show hello message when page loads
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
  }
});

// Send initialization message to background script
chrome.runtime.sendMessage({ 
  action: 'contentScriptLoaded', 
  url: window.location.href 
}); 