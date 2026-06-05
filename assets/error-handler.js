/**
 * Enhanced Error Handling
 * Gracefully handles errors without breaking functionality
 */
(function() {
  'use strict';

  // Store original error handlers
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  // Track errors without breaking functionality
  let errorCount = 0;
  const MAX_ERRORS = 10;

  /**
   * Safe error logging
   */
  function safeErrorLog(message, error) {
    errorCount++;
    
    // Prevent error spam
    if (errorCount > MAX_ERRORS) {
      return;
    }

    // Log to console in development
    if (window.location.hostname === 'localhost' || window.location.hostname.includes('myshopify.com')) {
      originalConsoleError.call(console, '[Theme Error]', message, error || '');
    }

    // Optionally send to analytics (if configured)
    if (window.gtag && typeof window.gtag === 'function') {
      try {
        window.gtag('event', 'exception', {
          'description': message,
          'fatal': false
        });
      } catch (e) {
        // Silently fail if analytics not available
      }
    }
  }

  /**
   * Handle unhandled promise rejections
   */
  window.addEventListener('unhandledrejection', function(event) {
    safeErrorLog('Unhandled Promise Rejection', event.reason);
    // Don't prevent default - let it fail gracefully
  });

  /**
   * Handle JavaScript errors
   */
  window.addEventListener('error', function(event) {
    // Ignore errors from external scripts (third-party)
    if (event.filename && !event.filename.includes(window.location.hostname)) {
      return;
    }

    safeErrorLog('JavaScript Error: ' + event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  /**
   * Enhanced fetch error handling
   */
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    return originalFetch.apply(this, args)
      .catch(function(error) {
        // Only log network errors, not user cancellations
        if (error.name !== 'AbortError') {
          safeErrorLog('Fetch Error: ' + error.message, error);
        }
        // Re-throw to maintain original behavior
        throw error;
      });
  };

  /**
   * Safe cart operations with error handling
   */
  window.safeCartOperation = function(operation, fallback) {
    return function(...args) {
      try {
        return operation.apply(this, args);
      } catch (error) {
        safeErrorLog('Cart Operation Error', error);
        if (typeof fallback === 'function') {
          return fallback(...args);
        }
        return Promise.reject(error);
      }
    };
  };

  /**
   * Graceful degradation for missing features
   */
  window.checkFeatureSupport = function(feature, callback) {
    try {
      if (typeof callback === 'function') {
        callback();
      }
    } catch (error) {
      safeErrorLog('Feature not supported: ' + feature, error);
    }
  };

  // Export for use in other scripts
  window.ThemeErrorHandler = {
    log: safeErrorLog,
    safeCartOperation: window.safeCartOperation,
    checkFeatureSupport: window.checkFeatureSupport
  };
})();

