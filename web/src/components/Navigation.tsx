import { ShoppingCart, Menu } from "lucide-react";
import { Button } from "./ui/button";
import { useNavigate } from "react-router-dom";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";

export function Navigation() {
  const navigate = useNavigate();
  const cartItems = JSON.parse(localStorage.getItem("cart") || "[]");

  return (
    <div className="border-b">
      <div className="flex h-16 items-center px-4 container mx-auto">
        <Button
          variant="ghost"
          className="mr-6 px-0 text-lg font-bold"
          onClick={() => navigate("/")}
        >
          Owl Shoes
        </Button>
        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink
                className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
                onClick={() => navigate("/")}
              >
                Shop
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink
                className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
                onClick={() => navigate("/contact")}
              >
                Contact
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => navigate("/")}
        >
          <Menu className="h-6 w-6" />
        </Button>
        <div className="ml-auto flex items-center space-x-4">
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => navigate("/cart")}
          >
            <ShoppingCart className="h-6 w-6" />
            {cartItems.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {cartItems.length}
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}