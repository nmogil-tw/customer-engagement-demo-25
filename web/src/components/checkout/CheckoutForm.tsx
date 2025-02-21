import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { faker } from "@faker-js/faker";
import { CheckoutFormData } from "@/types/checkout";

interface CheckoutFormProps {
  onSubmit: (data: CheckoutFormData) => Promise<void>;
  loading: boolean;
}

export const CheckoutForm = ({ onSubmit, loading }: CheckoutFormProps) => {
  const [formData, setFormData] = useState<CheckoutFormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
  });

  const formatPhoneToE164 = (phone: string): string => {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, "");
    
    // Ensure the number starts with a "+" and has exactly 11 digits (including country code)
    if (digits.length === 10) {
      return `+1${digits}`; // Add US country code if not present
    } else if (digits.length === 11 && digits.startsWith("1")) {
      return `+${digits}`;
    }
    return phone; // Return original if format doesn't match expectations
  };

  const generateRandomData = () => {
    // Generate a random 10-digit number
    const randomDigits = Array.from({ length: 10 }, () => 
      Math.floor(Math.random() * 10)
    ).join('');
    
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@twilio.com`;
    
    setFormData({
      firstName,
      lastName,
      email,
      phone: formatPhoneToE164(randomDigits),
      address: faker.location.streetAddress(),
      city: faker.location.city(),
      state: faker.location.state(),
      zipCode: faker.location.zipCode(),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedPhone = formatPhoneToE164(e.target.value);
    setFormData({ ...formData, phone: formattedPhone });
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, email: e.target.value.toLowerCase() });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Checkout</h1>
      <div className="mb-6">
        <Button onClick={generateRandomData}>Generate Random Data</Button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">First Name</label>
            <Input
              value={formData.firstName}
              onChange={(e) =>
                setFormData({ ...formData, firstName: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Last Name</label>
            <Input
              value={formData.lastName}
              onChange={(e) =>
                setFormData({ ...formData, lastName: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <Input
              type="email"
              value={formData.email}
              onChange={handleEmailChange}
              required
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Phone</label>
            <Input
              value={formData.phone}
              onChange={handlePhoneChange}
              required
              placeholder="+12345678900"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-2">Address</label>
            <Input
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">City</label>
            <Input
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">State</label>
            <Input
              value={formData.state}
              onChange={(e) =>
                setFormData({ ...formData, state: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">ZIP Code</label>
            <Input
              value={formData.zipCode}
              onChange={(e) =>
                setFormData({ ...formData, zipCode: e.target.value })
              }
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Placing Order..." : "Place Order"}
        </Button>
      </form>
    </div>
  );
};