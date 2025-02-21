import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Navigation } from "@/components/Navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface CartItem {
  id: string;
  name: string;
  price: number;
  image_url: string;
  size: number;
  quantity: number;
}

const Cart = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const items = JSON.parse(localStorage.getItem("cart") || "[]");
    setCartItems(items);
  }, []);

  const updateCart = (newItems: CartItem[]) => {
    setCartItems(newItems);
    localStorage.setItem("cart", JSON.stringify(newItems));
  };

  const updateQuantity = (index: number, change: number) => {
    const newItems = [...cartItems];
    newItems[index].quantity = Math.max(1, newItems[index].quantity + change);
    updateCart(newItems);
  };

  const removeItem = (index: number) => {
    const newItems = cartItems.filter((_, i) => i !== index);
    updateCart(newItems);
    toast({
      title: "Item removed from cart",
      duration: 2000,
    });
  };

  const total = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  if (cartItems.length === 0) {
    return (
      <div>
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold mb-8">Shopping Cart</h1>
          <p className="text-gray-500">Your cart is empty</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-8">Shopping Cart</h1>
        <div className="grid grid-cols-1 gap-8">
          {cartItems.map((item, index) => (
            <div
              key={`${item.id}-${item.size}`}
              className="flex flex-col md:flex-row items-start space-y-4 md:space-y-0 md:space-x-4 p-4 border rounded-lg"
            >
              <img
                src={item.image_url}
                alt={item.name}
                className="w-full md:w-48 h-48 object-cover rounded-md"
              />
              <div className="flex-grow">
                <h2 className="text-xl font-semibold">{item.name}</h2>
                <p className="text-gray-600">Size: {item.size}</p>
                <p className="text-lg font-bold">${item.price}</p>
                <div className="flex items-center space-x-4 mt-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => updateQuantity(index, -1)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span>{item.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => updateQuantity(index, 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">
                  ${(item.price * item.quantity).toFixed(2)}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 text-right">
          <p className="text-2xl font-bold">Total: ${total.toFixed(2)}</p>
          <Button className="mt-4" onClick={() => navigate("/checkout")}>
            Proceed to Checkout
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Cart;