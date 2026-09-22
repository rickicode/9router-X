"use client";

import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

export default function Toggle({
 checked = false,
 onChange,
 label,
 description,
 disabled = false,
 size = "md",
 className,
 title,
 "aria-label": ariaLabel,
 "aria-labelledby": ariaLabelledby,
}) {
 const sizes = {
 sm: { track: "w-8 h-4", thumb: "size-3", translate: "translate-x-4" },
 md: { track: "w-11 h-6", thumb: "size-5", translate: "translate-x-5" },
 lg: { track: "w-14 h-7", thumb: "size-6", translate: "translate-x-7" },
 };

 const handleClick = () => {
 if (!disabled && onChange) onChange(!checked);
 };

 return (
 <div
 className={cn(
 "flex items-center gap-3",
 disabled && "opacity-50 cursor-not-allowed",
 className
 )}
 >
 <button
 type="button"
 role="switch"
 aria-checked={checked}
 aria-label={ariaLabel || (title && !label ? title : undefined)}
 aria-labelledby={ariaLabelledby}
 disabled={disabled}
 title={title}
 onClick={handleClick}
 className={cn(
 "relative inline-flex shrink-0 cursor-pointer rounded-full",
 " ease-in-out",
"focus-visible:outline-none",
 checked ? "bg-primary" : "bg-surface-3",
 sizes[size].track,
 disabled && "opacity-50 cursor-not-allowed"
 )}
 >
 <span
 className={cn(
 "pointer-events-none inline-block rounded-full bg-surface",
 "transform transition ease-in-out",
 checked ? sizes[size].translate : "translate-x-0.5",
 sizes[size].thumb,
 "mt-0.5"
 )}
 />
 </button>
 {(label || description) && (
 <div className="flex flex-col">
 {label && (
 <span className="text-sm font-medium text-text-main">{label}</span>
 )}
 {description && (
 <span className="text-xs text-text-muted">{description}</span>
 )}
 </div>
 )}
 </div>
 );
}

Toggle.propTypes = {
 checked: PropTypes.bool,
 onChange: PropTypes.func,
 label: PropTypes.string,
 description: PropTypes.string,
 disabled: PropTypes.bool,
 size: PropTypes.oneOf(["sm", "md", "lg"]),
 className: PropTypes.string,
 title: PropTypes.string,
 "aria-label": PropTypes.string,
 "aria-labelledby": PropTypes.string,
};
