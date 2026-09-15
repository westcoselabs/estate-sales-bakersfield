import "server-only";
import { FileMediaStore } from "./file-media-store";
export { verifyFileMediaSignature as verifyTestMediaSignature } from "./file-media-store";
export class TestFileMediaStore extends FileMediaStore {
  constructor(root: string, secret: string, applicationUrl: URL) {
    super(root, secret, applicationUrl, "test");
  }
}
