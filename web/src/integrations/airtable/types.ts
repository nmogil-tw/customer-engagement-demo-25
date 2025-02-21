// Product types
export interface Product {
    id?: string;  // Optional for creation
    name: string;
    description?: string;
    price: number;
    image_url?: string;
    category?: string;
    brand?: string;
    size: number[];
    color?: string;
    current_discount?: string;
    fields?: {
      id: string;
    };
}
  
// Customer types
export interface Customer {
    id?: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zip_code: string;
}
  
// Order types
export interface OrderItem {
    product_id: string;
    quantity: number;
    price: number;
    size: number;
}
  
export interface Order {
    id?: string;
    items: OrderItem[];
    total_amount: number;
    shipping_status: string;
    customer_id: string;
    email: string;
    phone: string;
    return_id?: string;
}
  
// Return types
export interface Return {
    id?: string;
    order_id: string;
    customer_id: string;
    reason: string;
    status: string;
    refund_amount: number;
}
  
// Survey types
export interface Survey {
    id?: string;
    customer_id?: string;
    feedback?: string;
    rating?: number;
}