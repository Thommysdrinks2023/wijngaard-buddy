import { useEffect, useState } from "react";
import { getInvoerder, setInvoerder } from "./data";

export function useInvoerder(): [string, (n: string) => void] {
  const [naam, setNaam] = useState<string>("");
  useEffect(() => {
    setNaam(getInvoerder());
  }, []);
  const update = (n: string) => {
    setNaam(n);
    setInvoerder(n);
  };
  return [naam, update];
}
