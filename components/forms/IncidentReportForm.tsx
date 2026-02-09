"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { CalendarIcon, Upload, X, CheckCircle, AlertCircle } from "@/components/Icons";
import { uploadData } from "aws-amplify/storage";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/lib/auth/useUserRole";

// Form validation schema
const formSchema = z.object({
  companyId: z.string().optional(), // For SuperAdmin company selection
  claimNumber: z.string()
    .min(1, "Claim number is required")
    .max(50, "Claim number must be 50 characters or less")
    .regex(/^[a-zA-Z0-9\-_]+$/, "Claim number can only contain letters, numbers, hyphens, and underscores"),
  firstName: z.string()
    .min(1, "First name is required")
    .max(50, "First name must be 50 characters or less")
    .regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters, spaces, hyphens, and apostrophes"),
  lastName: z.string()
    .min(1, "Last name is required")
    .max(50, "Last name must be 50 characters or less")
    .regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters, spaces, hyphens, and apostrophes"),
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .max(20, "Phone number must be 20 characters or less")
    .regex(/^[\d\s\-\(\)\+\.]+$/, "Phone number can only contain digits, spaces, hyphens, parentheses, plus signs, and periods")
    .transform((val) => val.replace(/\D/g, ''))
    .refine((val) => val.length >= 10 && val.length <= 15, "Phone number must be between 10 and 15 digits"),
  email: z.string()
    .min(1, "Email is required")
    .max(100, "Email must be 100 characters or less")
    .email("Invalid email address"),
  address: z.string()
    .min(1, "Street address is required")
    .max(200, "Street address must be 200 characters or less"),
  apartment: z.string()
    .max(20, "Apartment/Suite must be 20 characters or less")
    .optional(),
  city: z.string()
    .min(1, "City is required")
    .max(100, "City must be 100 characters or less")
    .regex(/^[a-zA-Z\s'-]+$/, "City can only contain letters, spaces, hyphens, and apostrophes"),
  state: z.string()
    .min(2, "State is required")
    .max(2, "Use 2-letter state code")
    .regex(/^[A-Z]{2}$/, "State must be 2 uppercase letters"),
  zip: z.string()
    .regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP code (use format: 12345 or 12345-6789)"),
  incidentDate: z.date({
    required_error: "Incident date is required",
  }).refine((date) => date <= new Date(), "Incident date cannot be in the future"),
  description: z.string()
    .min(10, "Description must be at least 10 characters")
    .max(2000, "Description must be 2000 characters or less"),

  // Weather Information
  weatherHailSize: z.string()
    .optional()
    .refine((val) => {
      if (!val || val === "") return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 10;
    }, "Hail size must be between 0 and 10 inches"),
  weatherDate: z.date().optional().refine((date) => !date || date <= new Date(), "Weather date cannot be in the future"),
  weatherDescription: z.string().max(500, "Weather description must be 500 characters or less").optional(),

  shingleExposure: z.string()
    .optional()
    .refine((val) => {
      if (!val || val === "") return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 0 && num <= 100;
    }, "Shingle exposure must be between 0 and 100 inches"),
  photos: z.array(z.instanceof(File)).optional(),
});

type FormData = z.infer<typeof formSchema>;

interface FileWithPreview extends File {
  preview: string;
}

interface IncidentReportFormProps {
  publicMode?: boolean;
  companyId?: string;
  companyName?: string;
  onSuccess?: () => void;
}

export function IncidentReportForm({
  publicMode = false,
  companyId: propCompanyId,
  companyName: propCompanyName,
  onSuccess,
}: IncidentReportFormProps = {}) {
  const { companyId: userCompanyId, companyName: userCompanyName, userEmail, isSuperAdmin } = useUserRole();

  // Use prop values in public mode, otherwise use user values
  const companyId = publicMode ? propCompanyId : userCompanyId;
  const companyName = publicMode ? propCompanyName : userCompanyName;
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [weatherDatePickerOpen, setWeatherDatePickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [companies, setCompanies] = useState<Array<{ id: string, name: string }>>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000); // Auto-hide after 5 seconds
  };

  // Fetch companies for SuperAdmins
  useEffect(() => {
    if (isSuperAdmin && !publicMode) {
      setLoadingCompanies(true);
      fetch('/api/admin/companies')
        .then(res => res.json())
        .then(data => {
          if (data.companies) {
            setCompanies(data.companies);
          }
        })
        .catch(error => {
          console.error("Error fetching companies:", error);
          showNotification('error', 'Failed to load companies list');
        })
        .finally(() => setLoadingCompanies(false));
    }
  }, [isSuperAdmin, publicMode]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyId: "",
      claimNumber: "",
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
      weatherHailSize: "",
      weatherDescription: "",
      shingleExposure: "",
      photos: [],
    },
  });

  const uploadPhotos = async (photos: FileWithPreview[], claimNumber: string, companyNameForPath: string): Promise<string[]> => {
    // Sanitize company name for use in file path (remove special characters, spaces)
    const sanitizedCompanyName = companyNameForPath.replace(/[^a-zA-Z0-9]/g, '_');

    const uploadPromises = photos.map(async (photo, index) => {
      const timestamp = Date.now();
      const path = `incident-photos/${sanitizedCompanyName}/${claimNumber}/${timestamp}-${index}-${photo.name}`;

      try {
        // Use server-side upload for public mode (unauthenticated users)
        if (publicMode) {
          const formData = new FormData();
          formData.append("file", photo);
          formData.append("path", path);

          const response = await fetch("/api/upload/photos", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Upload failed");
          }

          const result = await response.json();
          return result.path;
        } else {
          // Use Amplify Storage for authenticated users
          const result = await uploadData({
            path,
            data: photo,
            options: {
              contentType: photo.type,
            },
          }).result;
          return result.path;
        }
      } catch (error) {
        console.error("Error uploading photo:", error);
        throw error;
      }
    });

    return Promise.all(uploadPromises);
  };

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    let createdReportId: string | null = null;
    let finalPhotoUrls: string[] = [];

    try {
      console.log("=== FORM SUBMISSION START ===");
      console.log("Submitting form data:", data);
      console.log("Public mode:", publicMode);

      // Validate that SuperAdmin has selected a company
      if (isSuperAdmin && !publicMode && !data.companyId) {
        showNotification('error', 'Please select a company before submitting');
        setIsSubmitting(false);
        return;
      }

      // Verify authentication only if not in public mode
      let currentUser;
      if (!publicMode) {
        console.log("Checking authentication...");
        try {
          await fetchAuthSession();
          currentUser = await getCurrentUser();
          console.log("✅ Authentication verified");
        } catch (authError) {
          console.error("❌ Authentication check failed:", authError);
          throw new Error("You must be signed in to submit an incident report. Please sign in and try again.");
        }
      }

      // Determine company ID and name based on context
      let finalCompanyId: string | null;
      let finalCompanyName: string | null;

      if (publicMode) {
        finalCompanyId = propCompanyId || null;
        finalCompanyName = propCompanyName || null;
      } else if (isSuperAdmin && data.companyId) {
        finalCompanyId = data.companyId;
        const selectedCompany = companies.find(c => c.id === data.companyId);
        finalCompanyName = selectedCompany?.name || null;
      } else {
        finalCompanyId = userCompanyId || null;
        finalCompanyName = userCompanyName || null;
      }

      // 1. Upload photos first (if any)
      if (files.length > 0) {
        try {
          console.log("Uploading photos before report creation...");
          finalPhotoUrls = await uploadPhotos(files, data.claimNumber, finalCompanyName || "UnknownCompany");
          console.log("✅ Photos uploaded successfully! URLs:", finalPhotoUrls);
        } catch (storageError: any) {
          console.error("❌ Photo upload failed during pre-submission phase!");
          showNotification('error', "Photos could not be uploaded, but we will try to submit the report anyway.");
        }
      }

      // Construct Weather Report JSON
      const weatherReport = {
        reported_hail_size_inches: data.weatherHailSize ? parseFloat(data.weatherHailSize) : undefined,
        weather_date: data.weatherDate ? data.weatherDate.toISOString().split('T')[0] : undefined,
        weather_description: data.weatherDescription,
      };

      // 2. Create incident report with photo URLs included
      const incidentData = {
        claimNumber: data.claimNumber,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone.replace(/\D/g, ''),
        email: data.email,
        address: data.address,
        apartment: data.apartment || "",
        city: data.city,
        state: data.state,
        zip: data.zip,
        incidentDate: data.incidentDate.toISOString().split('T')[0],
        description: data.description,
        shingleExposure: data.shingleExposure ? parseFloat(data.shingleExposure) : undefined,
        photoUrls: finalPhotoUrls,
        companyId: finalCompanyId,
        companyName: finalCompanyName,
        submittedBy: publicMode ? data.email : (userEmail || currentUser?.username),
        weatherReport: JSON.stringify(weatherReport), // Pass as JSON string
      };

      console.log("Calling API to create incident report...");
      const apiEndpoint = publicMode ? "/api/public/incident-reports" : "/api/incident-reports";
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(incidentData),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to create incident report");
      }

      createdReportId = result.report?.id || result.reportId;
      console.log("✅ Success! Created incident report with ID:", createdReportId);

      // Trigger AI Analysis in the background (fire and forget)
      if (createdReportId) {
        console.log("Triggering auto-analysis for:", createdReportId);
        fetch(`/api/incident-reports/${createdReportId}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        }).catch(err => console.error("Auto-analysis trigger failed:", err));
      }

      const successMessage = files.length > 0 && finalPhotoUrls.length === 0
        ? "Incident report submitted successfully! (Photos could not be uploaded)"
        : files.length > 0 && finalPhotoUrls.length > 0
          ? `Incident report submitted successfully with ${finalPhotoUrls.length} photo(s)!`
          : `Incident report submitted successfully!`;

      if (onSuccess) {
        onSuccess();
      } else {
        showNotification('success', successMessage);
      }

      form.reset();
      setFiles([]);
    } catch (error: any) {
      console.error("=== ERROR DETAILS ===");
      console.error(error);
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
    const MAX_FILES = 20;
    const remainingSlots = MAX_FILES - files.length;

    if (remainingSlots <= 0) {
      alert("Maximum limit of 20 images reached.");
      return;
    }

    const validFiles: FileWithPreview[] = [];
    const filesArray = Array.from(fileList).slice(0, remainingSlots);

    if (fileList.length > remainingSlots) {
      alert(`Only the first ${remainingSlots} valid files were added. Maximum limit is 20 images.`);
    }

    filesArray.forEach((file) => {
      // Check file type: JPEG, PNG, GIF
      const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
      if (allowedTypes.includes(file.type)) {
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
          {/* Company Selection - Only for SuperAdmin */}
          {isSuperAdmin && !publicMode && (
            <FormField
              control={form.control}
              name="companyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Select Company *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={loadingCompanies}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={loadingCompanies ? "Loading companies..." : "Select a company"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Claim Number */}
          <FormField
            control={form.control}
            name="claimNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Claim Number</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter claim number (e.g., CLM-2024-001)"
                    maxLength={50}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* First Name / Last Name Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter first name"
                      maxLength={50}
                      {...field}
                    />
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
                    <Input
                      placeholder="Enter last name"
                      maxLength={50}
                      {...field}
                    />
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
                          field.value.toLocaleDateString("en-US", { dateStyle: "long" })
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

          {/* Weather Information Section */}
          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium">Weather Information</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Hail Size */}
              <FormField
                control={form.control}
                name="weatherHailSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hail Size (Inches)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.25"
                          min="0"
                          max="10"
                          placeholder="e.g. 1.5"
                          {...field}
                          className="pr-16"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                          inches
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Weather Date */}
              <FormField
                control={form.control}
                name="weatherDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weather Date</FormLabel>
                    <Popover open={weatherDatePickerOpen} onOpenChange={setWeatherDatePickerOpen}>
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
                              field.value.toLocaleDateString("en-US", { dateStyle: "long" })
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
                            setWeatherDatePickerOpen(false);
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
            </div>

            {/* Weather Description */}
            <FormField
              control={form.control}
              name="weatherDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Weather Description</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Severe thunderstorm with hail reported"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

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
                    accept=".jpg,.jpeg,.png,.gif"
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
                *Note: We only accept .JPG, .PNG, .GIF file formats &bull; Max 20 images*
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