# Next.js issue 77549 reproduction

This app isolates the reported nested image field. The child watches `items.0.smallImageUrl` exactly. Completing an upload first writes the nested loading value, then replaces the parent `items` array as in the reporter's add-raw form. The preview should replace the loading state.

Run `node verify.mjs`. Exit 0 means the upload completed but the nested preview did not appear; exit 1 means the preview appeared; any other exit code means verification failed.
