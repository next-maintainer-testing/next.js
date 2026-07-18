import Link from "next/link";

export default function LinkWrapper({
  onClick,
}: {
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Link href="#" onClick={onClick}>
      Hello, world!
    </Link>
  );
}
