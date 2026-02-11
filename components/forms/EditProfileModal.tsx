"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/Form";
import { updateUserAttributes, updatePassword } from "aws-amplify/auth";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

// Profile Schema
const profileSchema = z.object({
    given_name: z.string().min(1, { message: "First name is required." }),
    family_name: z.string().min(1, { message: "Last name is required." }),
    phone_number: z.string()
        .min(14, { message: "Phone number is invalid. Format: (XXX) XXX-XXXX" })
        .max(14, { message: "Phone number is invalid. Format: (XXX) XXX-XXXX" }),
    email: z.string().email({ message: "Invalid email address." }),
    address: z.string().min(1, { message: "Address is required." }),
    apartment: z.string().optional(),
    city: z.string().min(1, { message: "City is required." }),
    state: z.string().min(1, { message: "State is required." }).max(2, { message: "Use 2-letter state code." }),
    zipCode: z.string().regex(/^\d{5}$/, { message: "Zip code must be 5 digits." }),
});

// Password Schema
const passwordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});

interface EditProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    userData: {
        given_name: string;
        family_name: string;
        phone_number: string;
        email: string;
        address: string;
    };
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

export function EditProfileModal({
    isOpen,
    onClose,
    onSuccess,
    userData,
}: EditProfileModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    // Profile Form
    const profileForm = useForm<z.infer<typeof profileSchema>>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            given_name: "",
            family_name: "",
            phone_number: "",
            email: "",
            address: "",
            apartment: "",
            city: "",
            state: "",
            zipCode: "",
        },
    });

    // Password Form
    const passwordForm = useForm<z.infer<typeof passwordSchema>>({
        resolver: zodResolver(passwordSchema),
        defaultValues: {
            currentPassword: "",
            newPassword: "",
            confirmPassword: "",
        },
    });

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

    // Reset forms when userData changes or modal opens
    useEffect(() => {
        if (isOpen) {
            let formattedPhone = userData.phone_number || "";
            // Handle +1 prefix if present
            if (formattedPhone.startsWith("+1")) {
                formattedPhone = formattedPhone.substring(2);
            }
            // Apply formatting
            formattedPhone = formatPhoneNumber(formattedPhone);

            // Parse the combined address string
            const parsed = parseAddress(userData.address);

            profileForm.reset({
                given_name: userData.given_name,
                family_name: userData.family_name,
                phone_number: formattedPhone,
                email: userData.email,
                address: parsed.street,
                apartment: parsed.apartment,
                city: parsed.city,
                state: parsed.state,
                zipCode: parsed.zip,
            });
            passwordForm.reset({
                currentPassword: "",
                newPassword: "",
                confirmPassword: "",
            });
        }
    }, [isOpen, userData, profileForm, passwordForm]);

    const onProfileSubmit = async (values: z.infer<typeof profileSchema>) => {
        setIsSubmitting(true);
        try {
            // Convert back to +1XXXXXXXXXX for Cognito
            const rawPhone = values.phone_number.replace(/\D/g, '');
            const formattedForCognito = `+1${rawPhone}`;

            // Combine address into a single string for Cognito
            const fullAddress = `${values.address.trim()}${values.apartment?.trim() ? `, ${values.apartment.trim()}` : ''}, ${values.city.trim()}, ${values.state.trim()} ${values.zipCode.trim()}`;

            await updateUserAttributes({
                userAttributes: {
                    given_name: values.given_name,
                    family_name: values.family_name,
                    phone_number: formattedForCognito,
                    address: fullAddress,
                },
            });

            toast({
                title: "Success",
                description: "Profile updated successfully.",
            });

            onSuccess();
            onClose();
        } catch (error) {
            console.error("Error updating profile:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to update profile. Please try again.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const onPasswordSubmit = async (values: z.infer<typeof passwordSchema>) => {
        setIsSubmitting(true);
        try {
            await updatePassword({
                oldPassword: values.currentPassword,
                newPassword: values.newPassword,
            });

            toast({
                title: "Success",
                description: "Password changed successfully. Please login again.",
            });

            passwordForm.reset();
            onClose();
        } catch (error: any) {
            console.error("Error changing password:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "Failed to change password. Please check your current password.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Edit Profile</DialogTitle>
                    <DialogDescription>
                        Update your personal information or change your password.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="profile" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="profile">Profile</TabsTrigger>
                        <TabsTrigger value="security">Security</TabsTrigger>
                    </TabsList>

                    <TabsContent value="profile" className="space-y-4 py-4">
                        <Form {...profileForm}>
                            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                                {/* Row 1: First Name | Last Name */}
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={profileForm.control}
                                        name="given_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>First Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="John" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={profileForm.control}
                                        name="family_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Last Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Doe" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Row 2: Phone Number | Email */}
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={profileForm.control}
                                        name="phone_number"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Phone Number</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        placeholder="(555) 555-5555"
                                                        onChange={(e) => {
                                                            const formatted = formatPhoneNumber(e.target.value);
                                                            field.onChange(formatted);
                                                        }}
                                                        maxLength={14}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={profileForm.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Email</FormLabel>
                                                <FormControl>
                                                    <Input {...field} disabled className="bg-muted" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Row 3: Address | Apartment, Suite (Optional) */}
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={profileForm.control}
                                        name="address"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Address</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="123 Main St" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={profileForm.control}
                                        name="apartment"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Apartment, Suite <span className="text-muted-foreground font-normal">(Optional)</span></FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Apt 4B" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Row 4: City | State | Zip Code */}
                                <div className="grid grid-cols-3 gap-4">
                                    <FormField
                                        control={profileForm.control}
                                        name="city"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>City</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Houston" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={profileForm.control}
                                        name="state"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>State</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="TX"
                                                        maxLength={2}
                                                        {...field}
                                                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={profileForm.control}
                                        name="zipCode"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Zip Code</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="77001"
                                                        maxLength={5}
                                                        inputMode="numeric"
                                                        {...field}
                                                        onChange={(e) => {
                                                            const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 5);
                                                            field.onChange(digitsOnly);
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-4">
                                    <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting ? "Saving..." : "Save Changes"}
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </TabsContent>

                    <TabsContent value="security" className="space-y-4 py-4">
                        <Form {...passwordForm}>
                            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                                <FormField
                                    control={passwordForm.control}
                                    name="currentPassword"
                                    render={({ field }) => (
                                        <FormItem className="grid grid-cols-4 items-center gap-4 space-y-0">
                                            <FormLabel className="text-right">Current</FormLabel>
                                            <div className="col-span-3">
                                                <FormControl>
                                                    <Input type="password" placeholder="Current Password" {...field} />
                                                </FormControl>
                                                <FormMessage className="mt-1" />
                                            </div>
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={passwordForm.control}
                                    name="newPassword"
                                    render={({ field }) => (
                                        <FormItem className="grid grid-cols-4 items-center gap-4 space-y-0">
                                            <FormLabel className="text-right">New</FormLabel>
                                            <div className="col-span-3">
                                                <FormControl>
                                                    <Input type="password" placeholder="New Password" {...field} />
                                                </FormControl>
                                                <FormMessage className="mt-1" />
                                            </div>
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={passwordForm.control}
                                    name="confirmPassword"
                                    render={({ field }) => (
                                        <FormItem className="grid grid-cols-4 items-center gap-4 space-y-0">
                                            <FormLabel className="text-right">Confirm</FormLabel>
                                            <div className="col-span-3">
                                                <FormControl>
                                                    <Input type="password" placeholder="Confirm New Password" {...field} />
                                                </FormControl>
                                                <FormMessage className="mt-1" />
                                            </div>
                                        </FormItem>
                                    )}
                                />

                                <div className="flex justify-end gap-3 pt-4">
                                    <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" variant="destructive" disabled={isSubmitting}>
                                        {isSubmitting ? "Updating..." : "Change Password"}
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
