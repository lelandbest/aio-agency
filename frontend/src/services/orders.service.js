import {
  getOrdersApi,
  createOrderApi,
  updateOrderApi,
  deleteOrderApi,
} from './backendApi';

export const OrdersService = {
  getOrders: () => getOrdersApi(),
  createOrder: (payload) => createOrderApi(payload),
  updateOrder: (orderId, payload) => updateOrderApi(orderId, payload),
  deleteOrder: (orderId) => deleteOrderApi(orderId),
};