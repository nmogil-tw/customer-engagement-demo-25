import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Navigation } from "@/components/Navigation";
import { airtable } from "@/integrations/airtable/client";
import type { Product } from "@/integrations/airtable/types";

const ProductDetails = () => {
  const { id } = useParams();
  const [selectedSize, setSelectedSize] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      try {
        const product = await airtable.getById("Products", id as string) as Product;
        return {
          ...product,
          // Ensure consistent data structure
          size: Array.isArray(product.size) ? product.size : JSON.parse(product.size as string),
          price: typeof product.price === 'number' ? product.price : parseFloat(product.price as string)
        };
      } catch (error) {
        console.error("Error fetching product:", error);
        throw error;
      }
    },
  });

  const addToCart = () => {
    if (!selectedSize) {
      toast({
        title: "Please select a size",
        variant: "destructive",
      });
      return;
    }

    const cartItems = JSON.parse(localStorage.getItem("cart") || "[]");
    const existingItemIndex = cartItems.findIndex(
      (item: any) => item.id === product.id && item.size === selectedSize
    );

    if (existingItemIndex >= 0) {
      cartItems[existingItemIndex].quantity += 1;
    } else {
      cartItems.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image_url: product.image_url,
        size: selectedSize,
        quantity: 1,
      });
    }

    localStorage.setItem("cart", JSON.stringify(cartItems));
    toast({
      title: "Added to cart",
      description: `${product.name} - Size ${selectedSize}`,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!product) {
    return <div>Product not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="aspect-w-1 aspect-h-1 w-full overflow-hidden rounded-lg bg-gray-200">
            <img
              src={product.image_url || "/placeholder.svg"}
              alt={product.name}
              className="h-full w-full object-cover object-center"
            />
          </div>
          <div className="flex flex-col space-y-4">
            <h1 className="text-3xl font-bold">{product.name}</h1>
            <p className="text-gray-600">{product.brand}</p>
            <p className="text-2xl font-bold">${product.price}</p>
            <p className="text-gray-700">{product.description}</p>
            <div>
              <h3 className="font-semibold mb-2">Select Size</h3>
              <div className="grid grid-cols-4 gap-2">
                {product.size.map((size: number) => (
                  <Button
                    key={size}
                    variant={selectedSize === size ? "default" : "outline"}
                    onClick={() => setSelectedSize(size)}
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              className="mt-8"
              size="lg"
              onClick={addToCart}
            >
              Add to Cart
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetails;