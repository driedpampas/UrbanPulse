import type { JSX } from 'preact';

type HoverButtonProps = JSX.IntrinsicElements['button'];

export function HoverButton({ onMouseEnter, onMouseLeave, children, ...props }: HoverButtonProps) {
    const handleMouseEnter: JSX.MouseEventHandler<HTMLButtonElement> = (e) => {
        (e.target as HTMLElement).style.filter = 'var(--hover-brightness)';
        onMouseEnter?.(e);
    };

    const handleMouseLeave: JSX.MouseEventHandler<HTMLButtonElement> = (e) => {
        (e.target as HTMLElement).style.filter = 'none';
        onMouseLeave?.(e);
    };

    return (
        <button {...props} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
            {children}
        </button>
    );
}
