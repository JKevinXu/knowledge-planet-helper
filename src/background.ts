/// <reference types="chrome"/>

import { Utils } from './utils';
import { DownloadMetadata, StorageData, MessageRequest, MessageResponse, CONSTANTS } from './types';

// Background script for Knowledge Planet Helper
Utils.log('Background script loaded!');

class BackgroundService {
  private popupPort: chrome.runtime.Port | null = null;
  private pendingDownloads = new Map<string, DownloadMetadata>();
  private processedDownloads = new Set<string>();


  constructor() {
    this.initializeExtension();
    this.setupEventListeners();
    this.startCleanupInterval();
  }

  private async initializeExtension(): Promise<void> {
    const initialData: StorageData = {
      installed: true,
      installDate: new Date().toISOString(),
      downloadedPDFs: [],
      downloadStats: {},
      pdfViews: {}
    };
    
    try {
      await Utils.setStorage(initialData);
      Utils.log('Extension initialized successfully');
    } catch (error) {
      Utils.error('Failed to initialize extension:', error);
    }
  }

  private setupEventListeners(): void {
    chrome.runtime.onInstalled.addListener(this.handleInstalled.bind(this));
    chrome.runtime.onConnect.addListener(this.handleConnection.bind(this));
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    chrome.downloads.onDeterminingFilename.addListener(this.handleFilenameChange.bind(this));
    chrome.tabs.onUpdated.addListener(this.handleTabUpdate.bind(this));
    chrome.contextMenus.onClicked.addListener(this.handleContextMenu.bind(this));
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanup();
    }, CONSTANTS.CLEANUP_INTERVAL);
  }

  private handleInstalled(details: chrome.runtime.InstalledDetails): void {
    Utils.log('Extension installed:', details);
    this.setupContextMenu();
  }

  private handleConnection(port: chrome.runtime.Port): void {
    if (port.name === 'popup') {
      this.popupPort = port;
      Utils.log('Popup connected for scan progress updates');
      
      port.onDisconnect.addListener(() => {
        this.popupPort = null;
        Utils.log('Popup disconnected');
      });
    }
  }

  private handleMessage(
    request: MessageRequest, 
    sender: chrome.runtime.MessageSender, 
    sendResponse: (response?: MessageResponse) => void
  ): boolean {
    Utils.log('Message received:', request.action);
    
    const handlers: Record<string, Function> = {
      downloadPDF: this.handlePDFDownload.bind(this),
      registerDownload: this.handleRegisterDownload.bind(this),
      trackPDFView: this.handlePDFView.bind(this),
      contentScriptLoaded: this.handleContentScriptLoaded.bind(this),
      scanProgress: this.forwardToPopup.bind(this),
      downloadSuccess: this.forwardToPopup.bind(this),
      downloadFailed: this.forwardToPopup.bind(this)
    };

    const handler = handlers[request.action];
    if (handler) {
      handler(request, sender, sendResponse);
    } else {
      Utils.warn('Unknown action:', request.action);
      sendResponse({ success: false, message: 'Unknown action' });
    }
    
    return true; // Keep message channel open for async responses
  }

  private forwardToPopup(request: MessageRequest): void {
    if (this.popupPort) {
      this.popupPort.postMessage(request);
      Utils.log(`Forwarded ${request.action} to popup`);
    }
  }

  private handleFilenameChange(
    downloadItem: chrome.downloads.DownloadItem,
    suggest: (suggestion?: chrome.downloads.DownloadFilenameSuggestion) => void
  ): boolean {
    Utils.log('Download filename determining:', downloadItem.filename);
    
    // Check if this is from a Knowledge Planet domain
    if (!downloadItem.url?.includes('zsxq.com')) {
      return false;
    }

    const originalFilename = downloadItem.filename || '';
    Utils.log(`Knowledge Planet download detected: ${originalFilename}`);
    
    // Find exact hash match by recreating hash from metadata
    for (const [hash, metadata] of this.pendingDownloads.entries()) {
      const expectedHash = Utils.createDownloadHash(metadata.fileName, metadata.downloadCount, metadata.uploadDate);
      
      if (hash === expectedHash) {
        Utils.log(`Found exact hash match: ${hash} for "${metadata.fileName}"`);
        
        const newFileName = Utils.formatFileName(
          metadata.fileName,
          metadata.uploadDate,
          metadata.downloadCount
        );
        
        Utils.log(`Renaming download: ${originalFilename} → ${newFileName}`);
        
        suggest({ filename: newFileName });
        this.pendingDownloads.delete(hash);
        return true;
      }
    }
    
    Utils.warn(`No hash match found for "${originalFilename}"`);
    return false;
  }

  private cleanup(): void {
    if (this.pendingDownloads.size > 0) {
      Utils.log(`Cleaning up ${this.pendingDownloads.size} pending downloads`);
      this.pendingDownloads.clear();
    }
    if (this.processedDownloads.size > 0) {
      Utils.log(`Cleaning up ${this.processedDownloads.size} processed downloads`);
      this.processedDownloads.clear();
    }
  }

  private setupContextMenu(): void {
    chrome.contextMenus.create({
      id: 'scanPDFs',
      title: 'Scan for PDFs',
      contexts: ['page'],
      documentUrlPatterns: ['https://wx.zsxq.com/*']
    });
  }

  private handleContextMenu(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): void {
    if (info.menuItemId === 'scanPDFs' && tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'scanPDFs' });
    }
  }

  private handleTabUpdate(_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): void {
    if (changeInfo.status === 'complete' && tab.url?.includes('wx.zsxq.com')) {
      Utils.log('Knowledge Planet page loaded, extension ready:', tab.url);
    }
  }

  private handleContentScriptLoaded(
    request: MessageRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): void {
    Utils.log('Content script loaded on:', request.url);
    sendResponse({ success: true, message: 'Background script acknowledged' });
  }

  private handleRegisterDownload(
    request: MessageRequest, 
    _sender: chrome.runtime.MessageSender, 
    sendResponse: (response: MessageResponse) => void
  ): void {
    const { fileName, uploadDate, downloadCount } = request;
    
    Utils.log(`Registering download metadata: ${fileName} (${uploadDate})`);
    
    const hashKey = Utils.createDownloadHash(fileName, downloadCount, uploadDate);
    
    // Check for duplicates early - before download starts
    if (this.processedDownloads.has(hashKey)) {
      Utils.warn(`Duplicate download detected, skipping: ${fileName}`);
      sendResponse({ success: false, message: 'Duplicate download prevented' });
      return;
    }
    
    // Mark as processed immediately to prevent race conditions
    this.processedDownloads.add(hashKey);
    
    // Store metadata with hash key
    const metadata: DownloadMetadata = {
      fileName,
      uploadDate,
      downloadCount
    };
    
    this.pendingDownloads.set(hashKey, metadata);
    
    Utils.log(`Download metadata registered with hash: ${hashKey} for "${fileName}"`);
    sendResponse({ success: true, message: 'Download metadata registered' });
  }

  private async handlePDFView(
    request: MessageRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    const { fileName, downloadCount, url } = request;
    
    Utils.log(`PDF viewed: ${fileName} (${downloadCount} total downloads)`);
    
    try {
      const data = await Utils.getStorage(['pdfViews', 'downloadStats']);
      const pdfViews = data.pdfViews || {};
      const downloadStats = data.downloadStats || {};
      
      const pdfKey = fileName.toLowerCase();
      pdfViews[pdfKey] = {
        fileName,
        lastViewed: new Date().toISOString(),
        actualDownloadCount: downloadCount,
        url
      };
      
      downloadStats[pdfKey] = downloadCount;
      
      await Utils.setStorage({ pdfViews, downloadStats });
      
      sendResponse({ 
        success: true, 
        message: 'PDF view tracked',
        eligible: downloadCount >= CONSTANTS.MIN_DOWNLOAD_COUNT
      });
      
    } catch (error) {
      Utils.error('Error tracking PDF view:', error);
      sendResponse({ 
        success: false, 
        message: 'Error tracking view',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handlePDFDownload(
    request: MessageRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    const { fileName, downloadCount, url } = request;
    
    Utils.log(`Processing PDF download request: ${fileName} (${downloadCount} downloads)`);
    
    try {
      const data = await Utils.getStorage(['downloadStats', 'downloadedPDFs']);
      const downloadStats = data.downloadStats || {};
      const downloadedPDFs = data.downloadedPDFs || [];
      
      const pdfKey = fileName.toLowerCase();
      const actualCount = downloadCount || downloadStats[pdfKey] || 0;
      
      Utils.log(`Actual download count for "${fileName}": ${actualCount}`);
      
      if (actualCount >= CONSTANTS.MIN_DOWNLOAD_COUNT) {
        Utils.log(`PDF "${fileName}" has ${actualCount} downloads, proceeding with download`);
        
        await this.simulateDownload(fileName, url);
        
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
        
        downloadStats[pdfKey] = actualCount;
        
        await Utils.setStorage({ downloadStats, downloadedPDFs });
        
        sendResponse({ 
          success: true, 
          message: `PDF download completed! (${actualCount} downloads)`,
          downloadCount: actualCount
        });
      } else {
        Utils.log(`PDF "${fileName}" has only ${actualCount} downloads, need ${CONSTANTS.MIN_DOWNLOAD_COUNT}+ to auto-download`);
        
        downloadStats[pdfKey] = actualCount;
        await Utils.setStorage({ downloadStats });
        
        sendResponse({ 
          success: false, 
          message: `PDF needs ${CONSTANTS.MIN_DOWNLOAD_COUNT - actualCount} more downloads to auto-download`,
          downloadCount: actualCount,
          required: CONSTANTS.MIN_DOWNLOAD_COUNT
        });
      }
      
    } catch (error) {
      Utils.error('Error handling PDF download:', error);
      sendResponse({ 
        success: false, 
        message: 'Error processing download request',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async simulateDownload(fileName: string, url: string): Promise<void> {
    Utils.log(`Initiating download of: ${fileName} from ${url}`);
    
    return new Promise((resolve) => {
      setTimeout(() => {
        Utils.log(`Download process completed: ${fileName}`);
        resolve();
      }, 1000);
    });
  }
}

// Initialize the background service
new BackgroundService();

