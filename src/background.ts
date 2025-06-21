/// <reference types="chrome"/>

// Background script for Knowledge Planet Helper
console.log('Knowledge Planet Helper: Background script loaded! 🌟');

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details);
  
  // Set up initial storage
  chrome.storage.local.set({
    installed: true,
    installDate: new Date().toISOString(),
    downloadedPDFs: [],
    downloadStats: {}
  });
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in background:', request);
  
  if (request.action === 'downloadPDF') {
    handlePDFDownload(request, sender, sendResponse);
  } else if (request.action === 'contentScriptLoaded') {
    console.log('📄 Content script loaded on:', request.url);
    sendResponse({ message: 'Background script acknowledged' });
  }
  
  return true; // Keep the message channel open for async responses
});

// Function to handle PDF download requests
async function handlePDFDownload(request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) {
  const { fileName, url } = request;
  
  console.log(`📄 Processing PDF download request: ${fileName}`);
  
  try {
    // Get current download stats
    const result = await chrome.storage.local.get(['downloadStats', 'downloadedPDFs']);
    const downloadStats = result.downloadStats || {};
    const downloadedPDFs = result.downloadedPDFs || [];
    
    // Update download count for this PDF
    const pdfKey = fileName.toLowerCase();
    downloadStats[pdfKey] = (downloadStats[pdfKey] || 0) + 1;
    
    console.log(`📊 Download count for "${fileName}": ${downloadStats[pdfKey]}`);
    
    // Check if this PDF meets download criteria (5+ downloads)
    if (downloadStats[pdfKey] >= 5) {
      console.log(`✅ PDF "${fileName}" has ${downloadStats[pdfKey]} downloads, proceeding with download`);
      
      // TODO: Implement actual PDF download
      // For now, we'll simulate the download
      await simulateDownload(fileName, url);
      
      // Add to downloaded PDFs list if not already there
      const pdfRecord = {
        fileName,
        url,
        downloadCount: downloadStats[pdfKey],
        downloadedAt: new Date().toISOString()
      };
      
      const existingIndex = downloadedPDFs.findIndex((pdf: any) => pdf.fileName === fileName);
      if (existingIndex >= 0) {
        downloadedPDFs[existingIndex] = pdfRecord;
      } else {
        downloadedPDFs.push(pdfRecord);
      }
      
      // Save updated data
      await chrome.storage.local.set({
        downloadStats,
        downloadedPDFs
      });
      
      sendResponse({ 
        success: true, 
        message: `PDF downloaded successfully! (${downloadStats[pdfKey]} downloads)`,
        downloadCount: downloadStats[pdfKey]
      });
    } else {
      console.log(`⏳ PDF "${fileName}" has only ${downloadStats[pdfKey]} downloads, need 5+ to auto-download`);
      
      // Save updated stats
      await chrome.storage.local.set({ downloadStats });
      
      sendResponse({ 
        success: false, 
        message: `PDF needs ${5 - downloadStats[pdfKey]} more downloads to auto-download`,
        downloadCount: downloadStats[pdfKey],
        required: 5
      });
    }
    
  } catch (error) {
    console.error('Error handling PDF download:', error);
    sendResponse({ 
      success: false, 
      message: 'Error processing download request',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Function to simulate PDF download (placeholder for actual download logic)
async function simulateDownload(fileName: string, url: string): Promise<void> {
  console.log(`🚀 Initiating download of: ${fileName} from ${url}`);
  
  // TODO: Implement actual download logic
  // This would typically involve:
  // 1. Finding the actual PDF download URL/endpoint
  // 2. Using chrome.downloads.download() API
  // 3. Handling download completion/failure
  
  // For now, just log the action
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(`✅ Download process completed: ${fileName}`);
      resolve();
    }, 1000);
  });
}

// Listen for tab updates to show PDF detection notifications
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('wx.zsxq.com')) {
    console.log('📄 Knowledge Planet page loaded, ready to detect PDFs:', tab.url);
    
    // Send message to content script to scan for PDFs
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, { action: 'scanPDFs' }).catch(() => {
        // Ignore errors if content script is not ready
      });
    }, 2000);
  }
});

// Add context menu for manual PDF scanning (optional)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'scanPDFs',
    title: 'Scan for PDFs',
    contexts: ['page'],
    documentUrlPatterns: ['https://wx.zsxq.com/*']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'scanPDFs' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'scanPDFs' });
  }
}); 