import { catchError } from "@keybr/debug";
import { KeyboardProvider } from "@keybr/keyboard";
import { schedule } from "@keybr/lang";
import { type Lesson } from "@keybr/lesson";
import { LessonLoader } from "@keybr/lesson-loader";
import { LoadingProgress } from "@keybr/pages-shared";
import { type Result, useResults } from "@keybr/result";
import { useSettings } from "@keybr/settings";
import { useEffect, useMemo, useState } from "react";
import { Controller } from "./Controller.tsx";
import { displayEvent, Progress } from "./state/index.ts";

export function PracticeScreen() {
  return (
    <KeyboardProvider>
      <LessonLoader>
        {(lesson) => <ProgressUpdater lesson={lesson} />}
      </LessonLoader>
    </KeyboardProvider>
  );
}

function ProgressUpdater({ lesson }: { readonly lesson: Lesson }) {
  const { results, appendResults } = useResults();
  const [progress] = useProgress(lesson, results);
  if (progress == null) {
    return <LoadingProgress />;
  } else {
    return (
      <Controller
        progress={progress}
        onResult={(result) => {
          if (result.validate()) {
            progress.append(result, displayEvent);
            appendResults([result]);
          }
        }}
      />
    );
  }
}

function useProgress(lesson: Lesson, results: readonly Result[]) {
  const { settings } = useSettings();
  const progress = useMemo(() => {
    let p = new Progress(settings, lesson);
    p.seed(lesson.filter(results));
    return p;
  }, [settings, lesson]);
  return [progress] as const;
}
