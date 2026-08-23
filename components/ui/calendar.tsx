"use client";

import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames, type DayButton } from "react-day-picker";

import { cn } from "@/lib/utils";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("bg-white p-3 [--cell-size:2rem]", className)}
      captionLayout={captionLayout}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("flex flex-col gap-4", defaultClassNames.months),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn("absolute inset-x-0 top-0 flex w-full items-center justify-between", defaultClassNames.nav),
        button_previous: cn("inline-flex size-(--cell-size) items-center justify-center rounded-md border bg-transparent p-0 hover:bg-slate-100", defaultClassNames.button_previous),
        button_next: cn("inline-flex size-(--cell-size) items-center justify-center rounded-md border bg-transparent p-0 hover:bg-slate-100", defaultClassNames.button_next),
        month_caption: cn("relative flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)", defaultClassNames.month_caption),
        caption_label: cn("select-none text-sm font-medium", defaultClassNames.caption_label),
        month_grid: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn("flex-1 select-none rounded-md text-center text-[0.8rem] font-normal text-slate-500", defaultClassNames.weekday),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        day: cn("group/day relative aspect-square h-full w-full select-none p-0 text-center", defaultClassNames.day),
        day_button: cn("flex size-(--cell-size) items-center justify-center rounded-md text-sm font-normal hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 aria-selected:bg-violet-700 aria-selected:text-white", defaultClassNames.day_button),
        selected: cn("rounded-md", defaultClassNames.selected),
        today: cn("rounded-md bg-slate-100 text-slate-950", defaultClassNames.today),
        outside: cn("text-slate-400 opacity-50", defaultClassNames.outside),
        disabled: cn("text-slate-400 opacity-50", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ className, orientation, ...chevronProps }) => {
          if (orientation === "left") return <ChevronLeft className={cn("size-4", className)} {...chevronProps} />;
          if (orientation === "right") return <ChevronRight className={cn("size-4", className)} {...chevronProps} />;
          return <ChevronDown className={cn("size-4", className)} {...chevronProps} />;
        },
        DayButton: CalendarDayButton,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();
  const ref = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle}
      className={cn(defaultClassNames.day_button, className)}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
