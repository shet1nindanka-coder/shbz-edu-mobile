export type PdfViewProps = {
  /** Local file URI of the downloaded PDF (web: its URL). */
  uri: string;
  /** File name, for the accessible title of the frame. */
  name: string;
  /** Asked to open the file outside the app (Android, where no in-app PDF renderer exists in Expo Go). */
  onOpenExternally: () => void;
  /** The external-open request is running. */
  opening: boolean;
};
