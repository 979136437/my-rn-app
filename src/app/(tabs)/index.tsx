import { Redirect, useLocalSearchParams } from "expo-router";

export default function Home() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: "/refresh-demo", params }} />;
}
