import React from "react";
import { useWatch } from "./useWatch";
import { useCollection } from "./useCollection";
import { useRealmApp } from "../components/RealmApp";
import { dataSourceName } from "../realm.json";
import {
  addValueAtIndex,
  replaceValueAtIndex,
  updateValueAtIndex,
  removeValueAtIndex,
  getTodoIndex,
} from "../utils";

export function useTodos() {
  // Set up a list of todos in state
  const realmApp = useRealmApp();
  const [todos, setTodos] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  // Get a client object for the todo task collection
  const taskCollection = useCollection({
    cluster: dataSourceName,
    db: "todo",
    collection: "Task",
  });

  // Fetch all todos on load and whenever our collection changes (e.g. if the current user changes)
  React.useEffect(() => {
    taskCollection.find({ isDeleted: false }).then((fetchedTodos) => {
      setTodos(fetchedTodos);
      setLoading(false);
    });
  }, [taskCollection]);

  // Use a MongoDB change stream to reactively update state when operations succeed
  useWatch(taskCollection, {
    onInsert: (change) => {
      setTodos((oldTodos) => {
        if (loading) {
          return oldTodos;
        }
        const idx =
          getTodoIndex(oldTodos, change.fullDocument) ?? oldTodos.length;
        return idx === oldTodos.length ? addValueAtIndex(oldTodos, idx, change.fullDocument) : oldTodos;
      });
    },
    onUpdate: (change) => {
      setTodos((oldTodos) => {
        if (loading) {
          return oldTodos;
        }
        const idx = getTodoIndex(oldTodos, change.fullDocument);
        if (change.fullDocument.isDeleted) {
          return idx >= 0 ? removeValueAtIndex(oldTodos, idx) : oldTodos;
        }

        return updateValueAtIndex(oldTodos, idx, () => {
          return change.fullDocument;
        });
      });
    },
    onReplace: (change) => {
      setTodos((oldTodos) => {
        if (loading) {
          return oldTodos;
        }
        const idx = getTodoIndex(oldTodos, change.fullDocument);
        return replaceValueAtIndex(oldTodos, idx, change.fullDocument);
      });
    },
    onDelete: (change) => {
      setTodos((oldTodos) => {
        if (loading) {
          return oldTodos;
        }
        const idx = getTodoIndex(oldTodos, { _id: change.documentKey._id });
        return idx >= 0 ? removeValueAtIndex(oldTodos, idx) : oldTodos;
      });
    },
  });

  // Given a draft todo, format it and then insert it
  const saveTodo = async (draftTodo) => {
    if (draftTodo.summary) {
      draftTodo._partition = realmApp.currentUser.id;
      try {
        await taskCollection.insertOne(draftTodo);
      } catch (err) {
        if (err.error.match(/^Duplicate key error/)) {
          console.warn(
            `The following error means that we tried to insert a todo multiple times (i.e. an existing todo has the same _id). In this app we just catch the error and move on. In your app, you might want to debounce the save input or implement an additional loading state to avoid sending the request in the first place.`
          );
        }
        console.error(err);
      }
    }
  };

  // Toggle whether or not a given todo is complete
  const toggleTodo = async (todo) => {
    await taskCollection.updateOne(
      { _id: todo._id },
      { $set: { isComplete: !todo.isComplete } }
    );
  };

  // Delete a given todo
  const deleteTodo = async (todo, hardDelete = true) => {
    if (hardDelete)
      await taskCollection.deleteOne({ _id: todo._id });
    else
      await taskCollection.updateOne(
        { _id: todo._id },
        { $set: { isDeleted: !todo.isDeleted } }
      );
  };

  return {
    loading,
    todos,
    saveTodo,
    toggleTodo,
    deleteTodo,
  };
}
