"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, Upload, X, CheckCircle, AlertCircle } from "lucide-react";
import { generateClient } from "aws-amplify/data";
import { uploadData } from "aws-amplify/storage";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
import type { Schema } from "@/amplify/data/resource";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Calendar } from "@/components/ui/Calendar";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/Form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

const client = generateClient<Schema>();

// Form validation schema
const formSchema = z.object({
  firstName: z.string().min(1, "First name is required").regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters, spaces, hyphens, and apostrophes"),
  lastName: z.string().min(1, "Last name is required").regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters, spaces, hyphens, and apostrophes"),
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .regex(/^[\d\s\-\(\)\+\.]+$/, "Phone number can only contain digits, spaces, hyphens, parentheses, plus signs, and periods")
    .transform((val) => val.replace(/\D/g, '')) // Remove non-digits for processing
    .refine((val) => val.length >= 10, "Phone number must have at least 10 digits"),
  email: z.string().email("Invalid email address"),
  address: z.string().min(1, "Address is required"),
  apartment: z.string().optional(),
  city: z.string().min(1, "City is required").regex(/^[a-zA-Z\s'-]+$/, "City can only contain letters, spaces, hyphens, and apostrophes"),
  state: z.string().min(2, "State is required").max(2, "State must be 2 characters").regex(/^[A-Z]{2}$/, "State must be 2 uppercase letters"),
  zip: z.string()
    .min(5, "ZIP code must be at least 5 digits")
    .regex(/^\d{5}(-\d{4})?$/, "ZIP code must be in format 12345 or 12345-6789"),
  incidentDate: z.date({
    required_error: "Date of incident is required",
  }),
  description: z.string().min(10, "Description must be at least 10 characters"),
  shingleExposure: z.string()
    .optional()
    .refine((val) => !val || (!isNaN(parseFloat(val)) && parseFloat(val) > 0 && parseFloat(val) <= 12), "Shingle exposure must be between 0 and 12 inches"),
  photos: z.array(z.instanceof(File)).optional(),
});

type FormData = z.infer<typeof formSchema>;

interface FileWithPreview extends File {
  preview: string;
}

export function IncidentReportForm() {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000); // Auto-hide after 5 seconds
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      address: "",
      apartment: "",
      city: "",
      state: "",
      zip: "",
      description: "",
      shingleExposure: "",
      photos: [],
    },
  });

  const uploadPhotos = async (photos: FileWithPreview[], reportId: string): Promise<string[]> => {
    const uploadPromises = photos.map(async (photo, index) => {
      const path = `incident-photos/${reportId}/${Date.now()}-${index}-${photo.name}`;
      try {
        const result = await uploadData({
          path,
          data: photo,
          options: {
            contentType: photo.type,
          },
        }).result;
        return result.path;
      } catch (error) {
        console.error("Error uploading photo:", error);
        throw error;
      }
    });

    return Promise.all(uploadPromises);
  };

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      console.log("=== FORM SUBMISSION START ===");
      console.log("Submitting form data:", data);
      
      // Verify authentication first
      console.log("Checking authentication...");
      let session;
      let currentUser;
      try {
        session = await fetchAuthSession();
        currentUser = await getCurrentUser();
        console.log("✅ Authentication verified:", {
          hasAccessToken: !!session.tokens?.accessToken,
          userId: currentUser.userId,
          username: currentUser.username,
        });
      } catch (authError) {
        console.error("❌ Authentication check failed:", authError);
        throw new Error("You must be signed in to submit an incident report. Please sign in and try again.");
      }

      if (!session.tokens?.accessToken) {
        throw new Error("No valid authentication token found. Please sign in and try again.");
      }
      
      // Check if client and models are available
      if (!client || !client.models) {
        throw new Error("Amplify client not properly configured");
      }
      
      if (!client.models.IncidentReport) {
        throw new Error("IncidentReport model not found. Please deploy the schema first using 'npx ampx sandbox'");
      }
      
      console.log("✅ Client and models available");
      console.log("Available models:", Object.keys(client.models || {}));

      // Prepare incident data without photos first
      console.log("Preparing incident data...");
      const incidentData = {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone.replace(/\D/g, ''), // Store only digits
        email: data.email,
        address: data.address,
        apartment: data.apartment || "",
        city: data.city,
        state: data.state,
        zip: data.zip,
        incidentDate: data.incidentDate.toISOString().split('T')[0], // Convert to date string
        description: data.description,
        shingleExposure: data.shingleExposure ? parseFloat(data.shingleExposure) : undefined,
        photoUrls: [],
      };

      console.log("Incident data to submit:", JSON.stringify(incidentData, null, 2));

      // Create incident report
      console.log("Calling API to create incident report...");
      const result = await client.models.IncidentReport.create(incidentData);

      console.log("=== API RESPONSE ===");
      console.log("Full result object:", result);
      console.log("Result.data:", result.data);
      console.log("Result.errors:", result.errors);
      console.log("===================");

      if (result.data) {
        console.log("✅ Success! Created incident report with ID:", result.data.id);
        const reportId = result.data.id;

        // Now upload photos with the report ID
        let photoUrls: string[] = [];
        if (files.length > 0) {
          try {
            console.log("Uploading photos for report:", reportId);
            console.log("Number of files to upload:", files.length);
            console.log("File details:", files.map(f => ({ name: f.name, type: f.type, size: f.size })));
            photoUrls = await uploadPhotos(files, reportId);
            console.log("✅ Photos uploaded successfully!");
            console.log("Photo URLs:", photoUrls);

            // Update report with photo URLs
            console.log("Updating report with photo URLs...");
            const updateResult = await client.models.IncidentReport.update({
              id: reportId,
              photoUrls: photoUrls,
            });

            if (updateResult.data) {
              console.log("✅ Report updated with photos");
            }
          } catch (storageError: any) {
            console.error("❌ Photo upload failed!");
            console.error("Error type:", storageError?.constructor?.name);
            console.error("Error message:", storageError?.message);
            console.error("Error details:", storageError);
            console.error("Full error object:", JSON.stringify(storageError, null, 2));
          }
        }

        const successMessage = files.length > 0 && photoUrls.length === 0
          ? "Incident report submitted successfully! (Photos could not be uploaded)"
          : files.length > 0 && photoUrls.length > 0
          ? `Incident report submitted successfully with ${photoUrls.length} photo(s)! ID: ${reportId}`
          : `Incident report submitted successfully! ID: ${reportId}`;

        showNotification('success', successMessage);
        form.reset();
        setFiles([]);
      } else if (result.errors && result.errors.length > 0) {
        console.error("❌ GraphQL errors:", result.errors);
        const errorMessages = result.errors.map(e => {
          console.error("Error details:", {
            message: e.message,
            errorType: e.errorType,
            path: e.path,
            locations: e.locations,
          });
          return e.message;
        }).join(', ');
        
        // Check for DynamoDB ResourceNotFoundException
        const isResourceNotFound = result.errors.some(e => 
          e.errorType === 'DynamoDB:ResourceNotFoundException' || 
          e.message?.includes('Requested resource not found')
        );
        
        if (isResourceNotFound) {
          throw new Error(
            "DynamoDB table not found. Please ensure your Amplify sandbox is running. " +
            "Run 'npx ampx sandbox' in a separate terminal to deploy your backend resources."
          );
        }
        
        throw new Error(`Failed to submit: ${errorMessages}`);
      } else {
        console.error("❌ No data and no errors returned - unexpected response");
        throw new Error("Failed to create incident report - no data returned and no errors reported");
      }
    } catch (error: any) {
      console.error("=== ERROR DETAILS ===");
      console.error("Error type:", error?.constructor?.name);
      console.error("Error message:", error?.message);
      console.error("Error stack:", error?.stack);
      console.error("Full error object:", error);
      console.error("====================");
      
      const errorMessage = error?.message || String(error) || "Unknown error occurred";
      showNotification('error', `Error submitting incident report: ${errorMessage}. Please check the browser console for details.`);
    } finally {
      setIsSubmitting(false);
      console.log("=== FORM SUBMISSION END ===");
    }
  };

  const formatPhoneNumber = (value: string) => {
    // Remove all non-digits
    const phoneNumber = value.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX
    if (phoneNumber.length >= 6) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
    } else if (phoneNumber.length >= 3) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    } else {
      return phoneNumber;
    }
  };

  const handleFiles = (fileList: FileList) => {
    const validFiles: FileWithPreview[] = [];
    
    Array.from(fileList).forEach((file) => {
      // Check file type
      if (file.type === "image/jpeg" || file.type === "image/png") {
        const fileWithPreview = Object.assign(file, {
          preview: URL.createObjectURL(file),
        });
        validFiles.push(fileWithPreview);
      }
    });

    setFiles((prev) => [...prev, ...validFiles]);
    form.setValue("photos", [...files, ...validFiles]);
  };

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    form.setValue("photos", newFiles);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Incident Report Form</h1>
      
      {/* Toast Notification */}
      {notification && (
        <div
          className={cn(
            "fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border transition-all duration-300 ease-in-out",
            notification.type === 'success'
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          )}
        >
          {notification.type === 'success' ? (
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600" />
          )}
          <span className="text-sm font-medium">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* First Name / Last Name Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter first name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter last name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Phone / Email Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="(555) 123-4567" 
                      value={field.value}
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
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter email address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Address Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <AddressAutocomplete
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Enter street address"
                    />
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
                    <Input placeholder="Apt, Suite, Unit, etc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* City, State, ZIP Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter city" {...field} />
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
                      placeholder="CA" 
                      value={field.value}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase().slice(0, 2);
                        field.onChange(value);
                      }}
                      maxLength={2}
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
                  <FormLabel>ZIP Code</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="12345" 
                      value={field.value}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                        field.onChange(value);
                      }}
                      maxLength={5}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Date of Incident */}
          <FormField
            control={form.control}
            name="incidentDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Date of Incident</FormLabel>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => {
                        field.onChange(date);
                        setDatePickerOpen(false);
                      }}
                      disabled={(date) =>
                        date > new Date() || date < new Date("1900-01-01")
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description of Issue</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Please describe the incident in detail..."
                    className="min-h-[120px]"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Shingle Exposure */}
          <FormField
            control={form.control}
            name="shingleExposure"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Shingle Exposure (Optional)</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      max="12"
                      placeholder="Enter measurement"
                      {...field}
                      className="pr-16"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                      inches
                    </span>
                  </div>
                </FormControl>
                <p className="text-xs text-gray-500">
                  Height from top to bottom of shingle (0-12 inches)
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* File Upload */}
          <div className="space-y-4">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Upload Photos
            </label>
            
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-2">
                Drag and drop your photos here, or{" "}
                <label className="text-primary cursor-pointer hover:underline">
                  browse files
                  <input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        handleFiles(e.target.files);
                      }
                    }}
                  />
                </label>
              </p>
              <p className="text-xs text-muted-foreground">
                *Note: We only accept .JPG, .PNG file formats*
              </p>
            </div>

            {/* File Previews */}
            {files.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {files.map((file, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={file.preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg border"
                    />
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {file.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit Report"}
          </Button>
        </form>
      </Form>
    </div>
  );
}