import { cn } from "@/lib/utils";
import { motion } from "motion/react";

interface AnimatedListProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  staggerDelay?: number;
  initialY?: number;
  springDuration?: number;
  springBounce?: number;
  className?: string;
}

export function AnimatedList<T>({
  items,
  keyExtractor,
  renderItem,
  staggerDelay = 0.04,
  initialY = 10,
  springDuration = 0.3,
  springBounce = 0.1,
  className,
}: AnimatedListProps<T>) {
  return (
    <div className={cn("space-y-4", className)}>
      {items.map((item, index) => (
        <motion.div
          key={keyExtractor(item)}
          initial={{ opacity: 0, y: initialY }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: index * staggerDelay,
            type: "spring",
            visualDuration: springDuration,
            bounce: springBounce,
          }}
        >
          {renderItem(item, index)}
        </motion.div>
      ))}
    </div>
  );
}
