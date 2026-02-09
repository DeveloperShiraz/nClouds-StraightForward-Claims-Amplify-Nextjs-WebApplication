"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "@/components/Icons";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export interface CalendarProps {
  mode?: "single";
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
  disabled?: (date: Date) => boolean;
  initialFocus?: boolean;
  className?: string;
}

export function Calendar({
  mode = "single",
  selected,
  onSelect,
  disabled,
  className,
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState(
    selected || new Date()
  );

  const daysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const firstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  // Generate year options (from 1900 to current year)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1899 }, (_, i) => 1900 + i);

  const previousMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)
    );
  };

  const nextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
    );
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), parseInt(e.target.value))
    );
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentMonth(
      new Date(parseInt(e.target.value), currentMonth.getMonth())
    );
  };

  const renderDays = () => {
    const days = [];
    const totalDays = daysInMonth(currentMonth);
    const firstDay = firstDayOfMonth(currentMonth);

    // Empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-9 w-9" />);
    }

    // Actual days
    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        day
      );
      const isSelected =
        selected &&
        date.getDate() === selected.getDate() &&
        date.getMonth() === selected.getMonth() &&
        date.getFullYear() === selected.getFullYear();
      const isToday =
        date.getDate() === new Date().getDate() &&
        date.getMonth() === new Date().getMonth() &&
        date.getFullYear() === new Date().getFullYear();
      const isDisabled = disabled ? disabled(date) : false;

      days.push(
        <Button
          key={day}
          variant={isSelected ? "default" : "ghost"}
          className={cn(
            "h-9 w-9 p-0 font-normal",
            isToday && !isSelected && "bg-accent",
            isDisabled && "opacity-50 cursor-not-allowed"
          )}
          onClick={() => !isDisabled && onSelect?.(date)}
          disabled={isDisabled}
        >
          {day}
        </Button>
      );
    }

    return days;
  };

  return (
    <div className={cn("p-3", className)}>
      {/* Header */}
      <div className="flex justify-between items-center mb-4 gap-2">
        <Button
          variant="outline"
          className="h-8 w-8 bg-transparent p-0 opacity-50 hover:opacity-100"
          onClick={previousMonth}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex gap-2">
          <select
            value={currentMonth.getMonth()}
            onChange={handleMonthChange}
            className="text-sm font-medium border rounded px-3 py-1.5 pr-8 bg-background hover:bg-accent cursor-pointer appearance-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 0.5rem center",
              backgroundSize: "12px",
            }}
          >
            {monthNames.map((month, index) => (
              <option key={month} value={index}>
                {month}
              </option>
            ))}
          </select>

          <select
            value={currentMonth.getFullYear()}
            onChange={handleYearChange}
            className="text-sm font-medium border rounded px-3 py-1.5 pr-8 bg-background hover:bg-accent cursor-pointer appearance-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 0.5rem center",
              backgroundSize: "12px",
            }}
          >
            {years.reverse().map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <Button
          variant="outline"
          className="h-8 w-8 bg-transparent p-0 opacity-50 hover:opacity-100"
          onClick={nextMonth}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 gap-0 mb-2">
        {dayNames.map((day) => (
          <div
            key={day}
            className="h-9 w-9 text-muted-foreground text-[0.8rem] font-normal flex items-center justify-center"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-0">{renderDays()}</div>
    </div>
  );
}
