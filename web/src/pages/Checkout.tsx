import { Navigation } from "@/components/Navigation";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { useCheckout } from "@/hooks/use-checkout";

const Checkout = () => {
  const { loading, handleSubmit } = useCheckout();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <CheckoutForm onSubmit={handleSubmit} loading={loading} />
      </div>
    </div>
  );
};

export default Checkout;