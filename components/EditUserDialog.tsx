"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { AlertCircle, Loader2 } from "@/components/Icons";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/Select";

// Interface matching the User type in UsersPage
interface User {
    username: string;
    email: string;
    given_name?: string;
    family_name?: string;
    phone_number?: string;
    address?: string;
    groups: string[];
    companyId?: string | null;
    companyName?: string | null;
}

interface EditUserDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: User | null;
    onUserUpdated: () => void;
}

// Parse a combined address string like "123 Main St, Apt 4B, Houston, TX 77001"
function parseAddress(fullAddress: string) {
    if (!fullAddress) return { street: "", apartment: "", city: "", state: "", zip: "" };

    // Split by commas
    const parts = fullAddress.split(",").map(p => p.trim());

    if (parts.length >= 4) {
        // Format: "street, apt, city, state zip"
        const stateZip = parts[parts.length - 1].trim().split(/\s+/);
        const zip = stateZip.pop() || "";
        const state = stateZip.join(" ");
        const city = parts[parts.length - 2].trim();
        const apartment = parts.slice(1, parts.length - 2).join(", ");
        const street = parts[0];
        return { street, apartment, city, state, zip };
    } else if (parts.length === 3) {
        // Format: "street, city, state zip"
        const stateZip = parts[2].trim().split(/\s+/);
        const zip = stateZip.pop() || "";
        const state = stateZip.join(" ");
        const city = parts[1].trim();
        const street = parts[0];
        return { street, apartment: "", city, state, zip };
    } else {
        return { street: fullAddress, apartment: "", city: "", state: "", zip: "" };
    }
}

const formatPhoneNumber = (value: string) => {
    // Remove all non-digits
    const phoneNumber = value.replace(/\D/g, '');

    // Format as (XXX) XXX-XXXX
    if (phoneNumber.length === 0) {
        return "";
    } else if (phoneNumber.length < 4) {
        return `(${phoneNumber}`;
    } else if (phoneNumber.length < 7) {
        return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    } else {
        return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
    }
};

export function EditUserDialog({
    open,
    onOpenChange,
    user,
    onUserUpdated,
}: EditUserDialogProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        given_name: "",
        family_name: "",
        phone_number: "",
        street: "",
        apartment: "",
        city: "",
        state: "",
        zipCode: "",
    });

    // Populate form when user changes
    useEffect(() => {
        if (user && open) {
            const addressParts = parseAddress(user.address || "");

            let formattedPhone = user.phone_number || "";
            // Handle +1 prefix if present
            if (formattedPhone.startsWith("+1")) {
                formattedPhone = formattedPhone.substring(2);
            }
            // Apply formatting
            formattedPhone = formatPhoneNumber(formattedPhone);

            setFormData({
                given_name: user.given_name || "",
                family_name: user.family_name || "",
                phone_number: formattedPhone,
                street: addressParts.street,
                apartment: addressParts.apartment,
                city: addressParts.city,
                state: addressParts.state,
                zipCode: addressParts.zip,
            });
        }
    }, [user, open]);


    const handleChange = (field: string, value: string) => {
        if (field === "phone_number") {
            setFormData(prev => ({ ...prev, [field]: formatPhoneNumber(value) }));
        } else if (field === "zipCode") {
            // Numbers only, max 5 digits
            const digitsOnly = value.replace(/\D/g, '').slice(0, 5);
            setFormData(prev => ({ ...prev, [field]: digitsOnly }));
        } else if (field === "state") {
            // Letters only, max 2 chars, uppercase
            const stateCode = value.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase();
            setFormData(prev => ({ ...prev, [field]: stateCode }));
        } else if (field === "city") {
            // Capitalize first letter
            const capitalized = value.length > 0
                ? value.charAt(0).toUpperCase() + value.slice(1)
                : value;
            setFormData(prev => ({ ...prev, [field]: capitalized }));
        } else {
            setFormData(prev => ({ ...prev, [field]: value }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setError(null);
        setLoading(true);

        try {
            // Reconstruct address
            const fullAddress = `${formData.street.trim()}${formData.apartment.trim() ? `, ${formData.apartment.trim()}` : ''}, ${formData.city.trim()}, ${formData.state.trim()} ${formData.zipCode.trim()}`;

            // Format phone for Cognito (+1XXXXXXXXXX)
            const rawPhone = formData.phone_number.replace(/\D/g, '');
            const formattedForCognito = rawPhone ? `+1${rawPhone}` : "";

            const attributes = {
                given_name: formData.given_name,
                family_name: formData.family_name,
                phone_number: formattedForCognito,
                address: fullAddress, // Use the constructed full address
            };

            const response = await fetch("/api/admin/users/update-profile", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    username: user.username,
                    attributes,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to update user profile");
            }

            onOpenChange(false);
            onUserUpdated();
        } catch (err: any) {
            setError(err.message || "An error occurred while updating the user profile");
        } finally {
            setLoading(false);
        }
    };

    if (!user) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Edit User Profile</DialogTitle>
                    <DialogDescription>
                        Update profile information for {user.email}.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        {/* Email (Read-only) */}
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input
                                id="email"
                                value={user.email}
                                disabled
                                className="bg-muted"
                            />
                            <p className="text-xs text-muted-foreground">Email cannot be changed directly.</p>
                        </div>

                        {/* Row 1: First Name | Last Name */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="given_name">First Name</Label>
                                <Input
                                    id="given_name"
                                    value={formData.given_name}
                                    onChange={(e) => handleChange("given_name", e.target.value)}
                                    placeholder="John"
                                    disabled={loading}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="family_name">Last Name</Label>
                                <Input
                                    id="family_name"
                                    value={formData.family_name}
                                    onChange={(e) => handleChange("family_name", e.target.value)}
                                    placeholder="Doe"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        {/* Phone Number */}
                        <div className="grid gap-2">
                            <Label htmlFor="phone_number">Phone Number</Label>
                            <Input
                                id="phone_number"
                                value={formData.phone_number}
                                onChange={(e) => handleChange("phone_number", e.target.value)}
                                placeholder="(555) 123-4567"
                                maxLength={14}
                                disabled={loading}
                            />
                        </div>

                        {/* Address Row 1 */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="street">Address</Label>
                                <Input
                                    id="street"
                                    value={formData.street}
                                    onChange={(e) => handleChange("street", e.target.value)}
                                    placeholder="123 Main St"
                                    disabled={loading}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="apartment">Apt/Suite (Optional)</Label>
                                <Input
                                    id="apartment"
                                    value={formData.apartment}
                                    onChange={(e) => handleChange("apartment", e.target.value)}
                                    placeholder="Apt 4B"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        {/* Address Row 2: City | State | Zip */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="city">City</Label>
                                <Input
                                    id="city"
                                    value={formData.city}
                                    onChange={(e) => handleChange("city", e.target.value)}
                                    placeholder="New York"
                                    disabled={loading}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="state">State</Label>
                                <Input
                                    id="state"
                                    value={formData.state}
                                    onChange={(e) => handleChange("state", e.target.value)}
                                    placeholder="NY"
                                    maxLength={2}
                                    disabled={loading}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="zipCode">Zip Code</Label>
                                <Input
                                    id="zipCode"
                                    value={formData.zipCode}
                                    onChange={(e) => handleChange("zipCode", e.target.value)}
                                    placeholder="10001"
                                    maxLength={5}
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
                                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                <p>{error}</p>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {loading ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
