import * as React from "react";

type Props = {
  message: string;
  onDismiss: () => void;
  duration?: number;
};

const Toast = ({ message, onDismiss, duration = 4000 }: Props) => {
  React.useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  return (
    <div className="toast" onClick={onDismiss}>
      {message}
    </div>
  );
};

export default Toast;
