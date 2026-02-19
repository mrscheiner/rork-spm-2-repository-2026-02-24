import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";

const FOOTER_LOGO_URL = "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/7mf3piipeptxq49889fh3";

export default function AppFooter() {
  return (
    <View style={styles.container}>
      <Image
        source={{ uri: FOOTER_LOGO_URL }}
        style={styles.logo}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 16,
    paddingBottom: 8,
  },
  logo: {
    width: 140,
    height: 84,
  },
});
