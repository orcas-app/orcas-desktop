interface StatusChipProps {
  variant?: "default" | "todo" | "in_progress" | "for_review" | "done";
  children: React.ReactNode;
}

function StatusChip({ variant = "default", children }: StatusChipProps) {
  const getVariantStyles = (variant: string) => {
    switch (variant) {
      case "todo":
        return {
          backgroundColor: "oklch(95.1% 0.026 236.824)",
          color: "oklch(44.3% 0.11 240.79)",
        };
      case "in_progress":
        return {
          backgroundColor: "oklch(93% 0.034 272.788)",
          color: "oklch(39.8% 0.195 277.366)",
        };
      case "for_review":
        return {
          backgroundColor: "oklch(96.2% 0.059 95.617)",
          color: "oklch(47.3% 0.137 46.201)",
        };
      case "done":
        return {
          backgroundColor: "oklch(95% 0.052 163.051)",
          color: "oklch(43.2% 0.095 166.913)",
        };
      default:
        return {
          backgroundColor: "oklch(70.7% 0.022 261.325)",
          color: "oklch(27.8% 0.033 256.848)",
        };
    }
  };

  const variantStyles = getVariantStyles(variant);

  return (
    <div
      className="chip"
      style={{
        ...variantStyles,
      }}
    >
      {children}
    </div>
  );
}

export default StatusChip;
