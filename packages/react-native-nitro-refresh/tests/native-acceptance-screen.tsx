import { useRef, useState } from "react";
import { Pressable, ScrollView, SectionList, Text, View } from "react-native";
import { NitroRefreshControl } from "../src";
import type { NitroRefreshControlRef, RefreshState } from "../src";

function TestButton({
  name,
  label,
  onPress,
}: {
  name: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="rounded bg-indigo-600 p-2"
    >
      <Text className="text-white">
        {name} {label}
      </Text>
    </Pressable>
  );
}

/** Mount temporarily in a development route to exercise native lifecycle edges. */
function Control({
  name,
  initial,
  section,
}: {
  name: string;
  initial: boolean;
  section: boolean;
}) {
  const ref = useRef<NitroRefreshControlRef>(null);
  const [refreshing, setRefreshing] = useState(initial);
  const [enabled, setEnabled] = useState(!initial);
  const [requests, setRequests] = useState(0);
  const [state, setState] = useState<RefreshState>("idle");
  const [reject, setReject] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [clicks, setClicks] = useState(0);
  const reopen = useRef(false);
  const control = (
    <NitroRefreshControl
      ref={ref}
      enabled={enabled}
      refreshing={refreshing}
      onRefresh={() => {
        setRequests((value) => value + 1);
        if (!reject) setRefreshing(true);
      }}
      onStateChange={(value) => {
        setState(value);
        if (value === "finishing" && reopen.current) {
          reopen.current = false;
          setRefreshing(true);
        }
      }}
    />
  );
  return (
    <View className="gap-2">
      <Text className="text-slate-900">
        {name}:{state}:{String(refreshing)}:requests={requests}:enabled=
        {String(enabled)}:reject={String(reject)}:scroll=
        {scrollOffset.toFixed(0)}:clicks={clicks}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <TestButton
          name={name}
          label="begin twice"
          onPress={() => {
            ref.current?.beginRefresh();
            ref.current?.beginRefresh();
          }}
        />
        <TestButton
          name={name}
          label="stop"
          onPress={() => setRefreshing(false)}
        />
        <TestButton
          name={name}
          label="enable"
          onPress={() => setEnabled((value) => !value)}
        />
        <TestButton
          name={name}
          label="reject"
          onPress={() => setReject((value) => !value)}
        />
        <TestButton
          name={name}
          label="reopen"
          onPress={() => {
            reopen.current = true;
            setRefreshing(false);
          }}
        />
      </View>
      <View className="h-[150px]">
        {section ? (
          <SectionList<number>
            className="flex-1"
            sections={[]}
            renderItem={({ item }) => <Text>{item}</Text>}
            ListEmptyComponent={
              <TestButton
                name={name}
                label="row tap"
                onPress={() => setClicks((value) => value + 1)}
              />
            }
            refreshControl={control}
            onScroll={(event) =>
              setScrollOffset(event.nativeEvent.contentOffset.y)
            }
          />
        ) : (
          <ScrollView
            className="flex-1"
            refreshControl={control}
            onScroll={(event) =>
              setScrollOffset(event.nativeEvent.contentOffset.y)
            }
          >
            <TestButton
              name={name}
              label="row tap"
              onPress={() => setClicks((value) => value + 1)}
            />
            {Array.from({ length: 6 }, (_, index) => (
              <Text key={index} className="p-4">
                test row {index}
              </Text>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

export default function NativeAcceptanceScreen() {
  const [showFirst, setShowFirst] = useState(true);
  return (
    <View className="flex-1 gap-4 bg-white p-4 pt-safe">
      <Pressable
        accessibilityRole="button"
        onPress={() => setShowFirst((value) => !value)}
        className="rounded bg-indigo-600 p-2"
      >
        <Text className="text-white">toggle A</Text>
      </Pressable>
      {showFirst ? <Control name="A" initial section /> : null}
      <Control name="B" initial={false} section={false} />
    </View>
  );
}
