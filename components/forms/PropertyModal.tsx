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
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { useToast } from "@/hooks/use-toast";

// Initialize Amplify client
const client = generateClient<Schema>();

const formSchema = z.object({
    propertyName: z.string().min(2, {
        message: "Property name must be at least 2 characters.",
    }),
    address: z.string().min(5, {
        message: "Address must be at least 5 characters.",
    }),
    apartment: z.string().optional(),
    city: z.string().min(2, {
        message: "City must be at least 2 characters.",
    }),
    state: z.string().length(2, {
        message: "State must be exactly 2 characters (e.g., NY).",
    }).regex(/^[A-Z]{2}$/, {
        message: "State must be 2 uppercase letters.",
    }),
    zip: z.string().regex(/^\d{5}$/, {
        message: "Zip code must be exactly 5 digits.",
    }),
});

interface PropertyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    property?: Schema["Property"]["type"] | null; // Optional property for editing
}

export function PropertyModal({
    isOpen,
    onClose,
    onSuccess,
    property,
}: PropertyModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            propertyName: "",
            address: "",
            apartment: "",
            city: "",
            state: "",
            zip: "",
        },
    });

    // Reset form when property changes or modal opens
    useEffect(() => {
        if (isOpen) {
            if (property) {
                form.reset({
                    propertyName: property.propertyName,
                    address: property.address,
                    apartment: property.apartment || "",
                    city: property.city,
                    state: property.state,
                    zip: property.zip,
                });
            } else {
                form.reset({
                    propertyName: "",
                    address: "",
                    apartment: "",
                    city: "",
                    state: "",
                    zip: "",
                });
            }
        }
    }, [isOpen, property, form]);

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsSubmitting(true);
        try {
            if (property) {
                // Update existing property
                const { errors } = await client.models.Property.update({
                    id: property.id,
                    propertyName: values.propertyName,
                    address: values.address,
                    apartment: values.apartment,
                    city: values.city,
                    state: values.state,
                    zip: values.zip,
                });

                if (errors) {
                    console.error("Error updating property:", errors);
                    toast({
                        variant: "destructive",
                        title: "Error",
                        description: "Failed to update property. Please try again.",
                    });
                    return;
                }

                toast({
                    title: "Success",
                    description: "Property updated successfully.",
                });
            } else {
                // Create new property
                const { errors } = await client.models.Property.create({
                    propertyName: values.propertyName,
                    address: values.address,
                    apartment: values.apartment,
                    city: values.city,
                    state: values.state,
                    zip: values.zip,
                });

                if (errors) {
                    console.error("Error creating property:", errors);
                    toast({
                        variant: "destructive",
                        title: "Error",
                        description: "Failed to add property. Please try again.",
                    });
                    return;
                }

                toast({
                    title: "Success",
                    description: "Property added successfully.",
                });
            }

            form.reset();
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Unexpected error saving property:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "An unexpected error occurred. Please try again.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{property ? "Edit Property" : "Add Property"}</DialogTitle>
                    <DialogDescription>
                        {property
                            ? "Update the details of your property below."
                            : "Enter the details of your new property below."}
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="propertyName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Property Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g., Main Residence" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="address"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Property Address</FormLabel>
                                    <FormControl>
                                        <Input placeholder="123 Main St" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="apartment"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Apartment, Suite (Optional)</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Apt 4B" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-3 gap-4">
                            <FormField
                                control={form.control}
                                name="city"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>City</FormLabel>
                                        <FormControl>
                                            <Input placeholder="New York" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="state"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>State</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="NY"
                                                {...field}
                                                onChange={(e) => {
                                                    const val = e.target.value.toUpperCase().slice(0, 2);
                                                    field.onChange(val);
                                                }}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="zip"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Zip Code</FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="10001"
                                                {...field}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/\D/g, '').slice(0, 5);
                                                    field.onChange(val);
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
                                {isSubmitting && (
                                    <svg
                                        className="animate-spin -ml-1 mr-3 h-4 w-4 text-white"
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                    >
                                        <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                        ></circle>
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        ></path>
                                    </svg>
                                )}
                                {property ? "Save Changes" : "Add Property"}
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
