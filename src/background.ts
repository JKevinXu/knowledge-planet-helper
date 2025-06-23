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
    downloadStats: {},
    pdfViews: {}
  });
});

// Store popup port for scan progress updates
let popupPort: chrome.runtime.Port | null = null;

// Store pending downloads with their metadata
let pendingDownloads: Map<string, { fileName: string; uploadDate: string; downloadCount: number }> = new Map();

// Track processed downloads to prevent duplicates
let processedDownloads: Set<string> = new Set();

// Simple hash function for creating reliable keys
function createDownloadHash(fileName: string, downloadCount: number, uploadDate: string): string {
  const input = `${fileName.trim()}_${downloadCount}_${uploadDate.trim()}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

// Listen for popup connection
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    popupPort = port;
    console.log('📱 Popup connected for scan progress updates');
    
    port.onDisconnect.addListener(() => {
      popupPort = null;
      console.log('📱 Popup disconnected');
    });
  }
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in background:', request);
  
  if (request.action === 'downloadPDF') {
    handlePDFDownload(request, sender, sendResponse);
  } else if (request.action === 'registerDownload') {
    handleRegisterDownload(request, sender, sendResponse);
  } else if (request.action === 'contentScriptLoaded') {
    console.log('📄 Content script loaded on:', request.url);
    sendResponse({ message: 'Background script acknowledged' });
  } else if (request.action === 'trackPDFView') {
    handlePDFView(request, sender, sendResponse);
  } else if (request.action === 'scanProgress') {
    // Forward scan progress to popup if connected
    if (popupPort) {
      popupPort.postMessage(request);
      console.log(`📊 Forwarded scan progress to popup: ${request.type} - ${request.scanned}/${request.total}`);
    }
    sendResponse({ message: 'Progress forwarded' });
  }
  
  return true; // Keep the message channel open for async responses
});

// Listen for download filename determination to rename files with upload date
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  console.log('📥 Download filename determining:', downloadItem);
  
  // Check if this is from a Knowledge Planet domain
  if (downloadItem.url && downloadItem.url.includes('zsxq.com')) {
    const originalFilename = downloadItem.filename || '';
    console.log(`📄 Knowledge Planet download detected: ${originalFilename}`);
    
    // Check if this download was already processed (prevent duplicates)
    const downloadKey = `${originalFilename}_${downloadItem.url}`;
    if (processedDownloads.has(downloadKey)) {
      console.log(`⚠️ Duplicate download detected, skipping: ${originalFilename}`);
      return false; // Let browser handle with original filename
    }
    
    // Try to find matching pending download using hash-based matching only
    console.log(`🔍 Looking for hash match among ${pendingDownloads.size} pending downloads`);
    console.log(`📋 Available hashes:`, Array.from(pendingDownloads.keys()));
    
    // Find exact hash match by recreating hash from metadata
    for (const [hash, metadata] of pendingDownloads.entries()) {
      // Try to recreate the hash from the metadata
      const expectedHash = createDownloadHash(metadata.fileName, metadata.downloadCount, metadata.uploadDate);
      
      if (hash === expectedHash) {
        console.log(`🎯 Found exact hash match: ${hash} for "${metadata.fileName}"`);
        
        // Mark this download as processed
        processedDownloads.add(downloadKey);
        
        // Create new filename with upload date and download count at the start
        const fileExtension = originalFilename.split('.').pop() || 'pdf';
        const baseFileName = metadata.fileName.replace(/\.[^/.]+$/, ''); // Remove extension
        const uploadDate = metadata.uploadDate.split(' ')[0]; // Extract only the date part (YYYY-MM-DD)
        const downloadCount = metadata.downloadCount;
        const newFileName = `${uploadDate}_${downloadCount}downloads_${baseFileName}.${fileExtension}`;
        
        console.log(`📝 Renaming download: ${originalFilename} → ${newFileName}`);
        
        // Suggest the new filename
        suggest({ filename: newFileName });
        
        // Remove from pending downloads
        pendingDownloads.delete(hash);
        return true; // Indicate we handled the filename
      }
    }
    
    console.warn(`❌ No hash match found for "${originalFilename}"`);
    console.log(`📋 Available metadata:`, Array.from(pendingDownloads.values()).map(m => `${m.fileName} (${createDownloadHash(m.fileName, m.downloadCount, m.uploadDate)})`));
  }
  
  // If no metadata found, use original filename
  return false;
});

// Clean up old pending downloads and processed downloads periodically
setInterval(() => {
  if (pendingDownloads.size > 0) {
    console.log(`🧹 Cleaning up ${pendingDownloads.size} pending downloads`);
    pendingDownloads.clear();
  }
  if (processedDownloads.size > 0) {
    console.log(`🧹 Cleaning up ${processedDownloads.size} processed downloads`);
    processedDownloads.clear();
  }
}, 60000); // Clean up every minute

// Function to register download metadata for filename modification
function handleRegisterDownload(request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) {
  const { fileName, uploadDate, downloadCount } = request;
  
  console.log(`📝 Registering download metadata: ${fileName} (${uploadDate})`);
  
  // Create hash-based key for reliable matching
  const hashKey = createDownloadHash(fileName, downloadCount, uploadDate);
  
  // Store metadata with hash key
  const metadata = {
    fileName,
    uploadDate,
    downloadCount
  };
  
  pendingDownloads.set(hashKey, metadata);
  
  console.log(`✅ Download metadata registered with hash: ${hashKey} for "${fileName}"`);
  sendResponse({ success: true, message: 'Download metadata registered' });
}

// Function to handle PDF view tracking
async function handlePDFView(request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) {
  const { fileName, downloadCount, url } = request;
  
  console.log(`👁️ PDF viewed: ${fileName} (${downloadCount} total downloads)`);
  
  try {
    // Get current view stats
    const result = await chrome.storage.local.get(['pdfViews', 'downloadStats']);
    const pdfViews = result.pdfViews || {};
    const downloadStats = result.downloadStats || {};
    
    // Track this view
    const pdfKey = fileName.toLowerCase();
    pdfViews[pdfKey] = {
      fileName,
      lastViewed: new Date().toISOString(),
      actualDownloadCount: downloadCount,
      url
    };
    
    // Update our internal download stats with the actual count
    downloadStats[pdfKey] = downloadCount;
    
    // Save updated data
    await chrome.storage.local.set({
      pdfViews,
      downloadStats
    });
    
    sendResponse({ 
      success: true, 
      message: 'PDF view tracked',
      eligible: downloadCount >= 5
    });
    
  } catch (error) {
    console.error('Error tracking PDF view:', error);
    sendResponse({ 
      success: false, 
      message: 'Error tracking view',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Function to handle PDF download requests
async function handlePDFDownload(request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) {
  const { fileName, downloadCount, url } = request;
  
  console.log(`📄 Processing PDF download request: ${fileName} (${downloadCount} downloads)`);
  
  try {
    // Get current download stats
    const result = await chrome.storage.local.get(['downloadStats', 'downloadedPDFs']);
    const downloadStats = result.downloadStats || {};
    const downloadedPDFs = result.downloadedPDFs || [];
    
    // Use the actual download count from the modal
    const pdfKey = fileName.toLowerCase();
    const actualCount = downloadCount || downloadStats[pdfKey] || 0;
    
    console.log(`📊 Actual download count for "${fileName}": ${actualCount}`);
    
    // Check if this PDF meets download criteria (5+ downloads)
    if (actualCount >= 5) {
      console.log(`✅ PDF "${fileName}" has ${actualCount} downloads, proceeding with download`);
      
      // Simulate the download process
      await simulateDownload(fileName, url);
      
      // Add to downloaded PDFs list if not already there
      const pdfRecord = {
        fileName,
        url,
        downloadCount: actualCount,
        downloadedAt: new Date().toISOString(),
        method: 'auto-download'
      };
      
      const existingIndex = downloadedPDFs.findIndex((pdf: any) => pdf.fileName === fileName);
      if (existingIndex >= 0) {
        downloadedPDFs[existingIndex] = pdfRecord;
      } else {
        downloadedPDFs.push(pdfRecord);
      }
      
      // Update stats
      downloadStats[pdfKey] = actualCount;
      
      // Save updated data
      await chrome.storage.local.set({
        downloadStats,
        downloadedPDFs
      });
      
      sendResponse({ 
        success: true, 
        message: `PDF download completed! (${actualCount} downloads)`,
        downloadCount: actualCount
      });
    } else {
      console.log(`⏳ PDF "${fileName}" has only ${actualCount} downloads, need 5+ to auto-download`);
      
      // Update stats with actual count
      downloadStats[pdfKey] = actualCount;
      await chrome.storage.local.set({ downloadStats });
      
      sendResponse({ 
        success: false, 
        message: `PDF needs ${5 - actualCount} more downloads to auto-download`,
        downloadCount: actualCount,
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

// Listen for tab updates (removed auto-scan, now only manual via popup)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('wx.zsxq.com')) {
    console.log('📄 Knowledge Planet page loaded, extension ready. Use popup to scan for PDFs:', tab.url);
    // Auto-scan removed - user must click "Scan Current Page" button
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