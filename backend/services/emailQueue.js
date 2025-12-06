const logger = require('../utils/logger');

/**
 * Email Queue Service
 *
 * Simple in-memory queue for async email sending
 * Prevents blocking API responses while sending emails
 *
 * Features:
 * - Non-blocking email dispatch
 * - Automatic retry on failure (up to 3 attempts)
 * - Graceful error handling
 * - Memory-efficient (queue cleared after processing)
 */

class EmailQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.processingInterval = null;
  }

  /**
   * Add email to queue
   * @param {Function} emailFn - Async function that sends email
   * @param {Object} context - Context for logging (e.g., { type, recipient })
   */
  enqueue(emailFn, context = {}) {
    const queueItem = {
      id: this.generateId(),
      emailFn,
      context,
      attempts: 0,
      maxAttempts: 3,
      enqueuedAt: Date.now()
    };

    this.queue.push(queueItem);

    logger.info('[EmailQueue] Email added to queue', {
      queueId: queueItem.id,
      context,
      queueLength: this.queue.length
    });

    // Start processing if not already processing
    if (!this.processing) {
      this.startProcessing();
    }

    return queueItem.id;
  }

  /**
   * Start processing queue
   */
  startProcessing() {
    if (this.processing) return;

    this.processing = true;
    logger.info('[EmailQueue] Started processing queue');

    // Process immediately
    this.processQueue();

    // Set interval to process every 5 seconds
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 5000);
  }

  /**
   * Stop processing queue
   */
  stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.processing = false;
    logger.info('[EmailQueue] Stopped processing queue');
  }

  /**
   * Process queue items
   */
  async processQueue() {
    if (this.queue.length === 0) {
      // Stop processing if queue is empty for more than 1 minute
      if (this.processing && !this._lastQueueTime) {
        this._lastQueueTime = Date.now();
      } else if (this._lastQueueTime && (Date.now() - this._lastQueueTime > 60000)) {
        this.stopProcessing();
        this._lastQueueTime = null;
      }
      return;
    }

    this._lastQueueTime = null; // Reset timer when queue has items

    // Process one item at a time (FIFO)
    const item = this.queue.shift();

    try {
      logger.info('[EmailQueue] Processing email', {
        queueId: item.id,
        attempt: item.attempts + 1,
        context: item.context
      });

      // Execute email send function
      await item.emailFn();

      // Log success
      const duration = Date.now() - item.enqueuedAt;
      logger.info('[EmailQueue] Email sent successfully', {
        queueId: item.id,
        context: item.context,
        duration: `${duration}ms`,
        remainingQueue: this.queue.length
      });

    } catch (error) {
      item.attempts++;

      logger.error('[EmailQueue] Email send failed', {
        queueId: item.id,
        attempt: item.attempts,
        maxAttempts: item.maxAttempts,
        context: item.context,
        error: error.message
      });

      // Retry if attempts < maxAttempts
      if (item.attempts < item.maxAttempts) {
        // Re-queue at the end with exponential backoff delay
        const retryDelay = Math.pow(2, item.attempts) * 1000; // 2s, 4s, 8s
        setTimeout(() => {
          this.queue.push(item);
          logger.info('[EmailQueue] Email re-queued for retry', {
            queueId: item.id,
            attempt: item.attempts,
            retryDelay: `${retryDelay}ms`
          });
        }, retryDelay);
      } else {
        // Max attempts reached - give up
        logger.error('[EmailQueue] Email send failed permanently', {
          queueId: item.id,
          context: item.context,
          attempts: item.attempts,
          error: error.message
        });
      }
    }
  }

  /**
   * Generate unique queue ID
   */
  generateId() {
    return `eq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      oldestItem: this.queue[0] ? {
        id: this.queue[0].id,
        enqueuedAt: this.queue[0].enqueuedAt,
        age: Date.now() - this.queue[0].enqueuedAt
      } : null
    };
  }

  /**
   * Clear queue (for testing/emergency)
   */
  clearQueue() {
    const clearedCount = this.queue.length;
    this.queue = [];
    logger.warn('[EmailQueue] Queue cleared', { clearedCount });
    return clearedCount;
  }
}

// Singleton instance
const emailQueue = new EmailQueue();

module.exports = emailQueue;
