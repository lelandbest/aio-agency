import {
  getHelpTicketsApi,
  createHelpTicketApi,
  updateHelpTicketApi,
  getHelpArticlesApi,
  getHelpBroadcastsApi,
  generateDocsApi,
  captureMissingHelpApi,
  getNotificationsApi,
  markNotificationReadApi,
  markAllNotificationsReadApi,
  deleteNotificationApi,
} from './backendApi';

export const HelpService = {
  getHelpTickets: () => getHelpTicketsApi(),
  createHelpTicket: (payload) => createHelpTicketApi(payload),
  updateHelpTicket: (ticketId, payload) => updateHelpTicketApi(ticketId, payload),
  getHelpArticles: () => getHelpArticlesApi(),
  getHelpBroadcasts: () => getHelpBroadcastsApi(),
  generateDocs: () => generateDocsApi(),
  captureMissingHelp: (query) => captureMissingHelpApi(query),
  getNotifications: (limit, unreadOnly) => getNotificationsApi(limit, unreadOnly),
  markNotificationRead: (notificationId) => markNotificationReadApi(notificationId),
  markAllNotificationsRead: () => markAllNotificationsReadApi(),
  deleteNotification: (notificationId) => deleteNotificationApi(notificationId),
};