import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { airtable } from "@/integrations/airtable/client";
import type { Product } from "@/integrations/airtable/types";

const Index = () => {
  const navigate = useNavigate();
  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      try {
        const products = await airtable.getAll("Products") as Product[];
        return products.map(product => ({
          ...product,
          // Ensure we have consistent data structure
          size: Array.isArray(product.size) ? product.size : JSON.parse(product.size as string),
          price: typeof product.price === 'number' ? product.price : parseFloat(product.price as string),
          // Use the ID field from Airtable instead of the record ID
          id: product.id || product.fields?.id // Fallback to fields.id if needed
        }));
      } catch (error) {
        console.error("Error fetching products:", error);
        throw error;
      }
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <header className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Owl Shoes</h1>
            <p className="text-xl text-gray-600">Discover your perfect pair</p>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products?.map((product) => (
              <Card 
                key={product.id} 
                className="hover:shadow-lg transition-shadow duration-300 cursor-pointer"
                onClick={() => navigate(`/product/${product.id}`)}
              >
                <div className="aspect-w-1 aspect-h-1 w-full overflow-hidden rounded-t-lg bg-gray-200">
                  <img
                    src={product.image_url || "/placeholder.svg"}
                    alt={product.name}
                    className="h-64 w-full object-cover object-center"
                  />
                </div>
                <CardHeader>
                  <CardTitle className="text-lg">{product.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-2">{product.brand}</p>
                  <p className="text-2xl font-bold text-gray-900">${product.price}</p>
                  <div className="mt-2">
                    <span className="text-sm text-gray-500">
                      Available sizes: {product.size.join(", ")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;