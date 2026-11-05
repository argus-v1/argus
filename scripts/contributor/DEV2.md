# Dev 2: open the contributor PR

You play an outside contributor. Your PR fixes the reported crash but misses a case, so Argus should catch it. Don't open the PR until Dev 1 says the pipeline is running.

## Once, beforehand

1. Sign in to GitHub with your own account.
2. Fork https://github.com/argus-v1/datewise (Fork button, top right). Keep the name `datewise`.
3. Clone your fork and add the patch file Dev 1 sends you (`fix-empty-string.patch`) to the folder:

   ```bash
   git clone https://github.com/<your-username>/datewise.git
   cd datewise
   ```

## Take: open the PR

```bash
git switch -c fix-empty-string
git apply ../fix-empty-string.patch        # path to wherever you saved it
git commit -am "Fix crash when parse_date gets empty string

Fixes #1"
git push -u origin fix-empty-string
```

Then on GitHub, open a pull request from your `fix-empty-string` branch into `argus-v1/datewise` `main`:

- **Title:** `Fix crash when parse_date gets empty string`
- **Body:**

  ```
  Fixes #1.

  parse_date("") now raises DateParseError("empty date string") instead of
  leaking an IndexError. Existing tests pass.
  ```

Don't add a test. The missing test is part of the story.

## Take: push the follow-up fix

After Argus comments with `changes-needed`, push the real fix to the same branch:

```bash
git apply ../fix-blank-string.patch
git commit -am "Treat whitespace-only input as empty too"
git push
```

The push re-triggers Argus, and the label should turn `verified`.

## Between takes

Dev 1 runs the reset script, which closes the PR and deletes the branch. Then start again from "Take: open the PR".
