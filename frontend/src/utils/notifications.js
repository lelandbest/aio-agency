/**
 * Trigger a notification from anywhere in the app.
 * The TopBar listens for these events and updates accordingly.
 * 
 * @param {Object} notification - Notification data
 * @param {string} notification.type - Type: 'high_email', 'system_update', 'sync_complete', 'bug_report'
 * @param {string} notification.title - Notification title
 * @param {string} notification.message - Notification message
 * @param {string} [notification.priority='normal'] - 'normal' or 'high'
 * @param {string} [notification.link] - Optional link to navigate to
 */
export function triggerNotification({ type, title, message, priority = 'normal', link = null }) {
    window.dispatchEvent(new CustomEvent('aio:notification', {
        detail: { type, title, message, priority, link }
    }));
}

/**
 * Trigger multiple notifications at once
 */
export function triggerNotifications(notifications) {
    notifications.forEach(n => triggerNotification(n));
}
