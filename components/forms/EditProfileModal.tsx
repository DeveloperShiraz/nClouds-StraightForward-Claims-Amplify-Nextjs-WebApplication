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
    };
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

            profileForm.reset({
                given_name: userData.given_name,
                family_name: userData.family_name,
                phone_number: formattedPhone,
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

            await updateUserAttributes({
                userAttributes: {
                    given_name: values.given_name,
                    family_name: values.family_name,
                    phone_number: formattedForCognito,
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
            <DialogContent className="sm:max-w-[500px]">
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
                        <div className="grid grid-cols-4 items-center gap-4">
                            <label className="text-right text-sm font-medium">Email</label>
                            <Input
                                value={userData.email}
                                disabled
                                className="col-span-3 bg-muted"
                            />
                        </div>

                        <Form {...profileForm}>
                            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                                <FormField
                                    control={profileForm.control}
                                    name="given_name"
                                    render={({ field }) => (
                                        <FormItem className="grid grid-cols-4 items-center gap-4 space-y-0">
                                            <FormLabel className="text-right">First Name</FormLabel>
                                            <div className="col-span-3">
                                                <FormControl>
                                                    <Input {...field} />
                                                </FormControl>
                                                <FormMessage className="mt-1" />
                                            </div>
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={profileForm.control}
                                    name="family_name"
                                    render={({ field }) => (
                                        <FormItem className="grid grid-cols-4 items-center gap-4 space-y-0">
                                            <FormLabel className="text-right">Last Name</FormLabel>
                                            <div className="col-span-3">
                                                <FormControl>
                                                    <Input {...field} />
                                                </FormControl>
                                                <FormMessage className="mt-1" />
                                            </div>
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={profileForm.control}
                                    name="phone_number"
                                    render={({ field }) => (
                                        <FormItem className="grid grid-cols-4 items-center gap-4 space-y-0">
                                            <FormLabel className="text-right">Phone</FormLabel>
                                            <div className="col-span-3">
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
                                                <FormMessage className="mt-1" />
                                            </div>
                                        </FormItem>
                                    )}
                                />

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
