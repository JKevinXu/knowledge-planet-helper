/// <reference types="chrome"/>

import { CONSTANTS } from './types';

// Utility functions for Knowledge Planet Helper

export class Utils {
  private static timers: Set<number> = new Set();

  /**
   * Create a reliable hash key for download tracking
   */
  static createDownloadHash(fileName: string, downloadCount: number, uploadDate: string): string {
    const input = `${fileName.trim()}_${downloadCount}_${uploadDate.trim()}`;
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Create a managed delay with cleanup tracking
   */
  static delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        resolve();
      }, ms);
      this.timers.add(timer);
    });
  }

  /**
   * Clean up all managed timers
   */
  static cleanup(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }

  /**
   * Cached DOM query with optional parent scope
   */
  static query<T extends Element>(
    selector: string, 
    parent: Document | Element = document,
    cache: Map<string, Element> = new Map()
  ): T | null {
    const cacheKey = `${selector}_${parent === document ? 'doc' : 'elem'}`;
    
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey) as T | null;
    }
    
    const element = parent.querySelector<T>(selector);
    if (element) {
      cache.set(cacheKey, element);
    }
    
    return element;
  }

  /**
   * Cached DOM query for multiple elements
   */
  static queryAll<T extends Element>(
    selector: string, 
    parent: Document | Element = document
  ): NodeListOf<T> {
    return parent.querySelectorAll<T>(selector);
  }

  /**
   * Wait for element to appear with timeout
   */
  static waitForElement<T extends Element>(
    selector: string,
    timeout: number = CONSTANTS.MODAL_TIMEOUT,
    parent: Document | Element = document
  ): Promise<T | null> {
    return new Promise((resolve) => {
      const element = this.query<T>(selector, parent);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = this.query<T>(selector, parent);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(parent === document ? document.body : parent as Element, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  /**
   * Extract download count from text using multiple patterns
   */
  static extractDownloadCount(text: string): number {
    const patterns = [
      /（下载次数：(\d+)）/,      // Chinese parentheses with colon
      /\(下载次数：(\d+)\)/,       // Regular parentheses with colon
      /下载次数：(\d+)/,          // Just with colon
      /下载次数[\s：:]*(\d+)/,    // Flexible spacing and colon variations
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    
    return 0;
  }

  /**
   * Debounced function execution
   */
  static debounce<T extends (...args: any[]) => void>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: number;
    
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
      this.timers.add(timeoutId);
    };
  }

  /**
   * Throttled function execution
   */
  static throttle<T extends (...args: any[]) => void>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let lastCall = 0;
    
    return (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        func(...args);
      }
    };
  }

  /**
   * Safe message sending with error handling
   */
  static async sendMessage(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response: any) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Safe storage operations
   */
  static async getStorage(keys?: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys || null, (result: any) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
  }

  static async setStorage(data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Format filename with date and download count
   */
  static formatFileName(fileName: string, uploadDate: string, downloadCount: number): string {
    const fileExtension = fileName.split('.').pop() || 'pdf';
    const baseFileName = fileName.replace(/\.[^/.]+$/, '');
    const date = uploadDate.split(' ')[0]; // Extract only date part
    return `${date}_${downloadCount}downloads_${baseFileName}.${fileExtension}`;
  }

  /**
   * Truncate text with ellipsis
   */
  static truncateText(text: string, maxLength: number): string {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  /**
   * Log with consistent formatting
   */
  static log(message: string, ...args: any[]): void {
    console.log(`🌟 Knowledge Planet Helper: ${message}`, ...args);
  }

  static warn(message: string, ...args: any[]): void {
    console.warn(`⚠️ Knowledge Planet Helper: ${message}`, ...args);
  }

  static error(message: string, ...args: any[]): void {
    console.error(`❌ Knowledge Planet Helper: ${message}`, ...args);
  }
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    Utils.cleanup();
  });
}