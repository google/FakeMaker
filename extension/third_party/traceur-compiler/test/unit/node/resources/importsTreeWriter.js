import {
  TreeWriter,
} from 'traceur@0/src/outputgeneration/TreeWriter';

export function dumpTree(tree) {
  return TreeWriter.write(tree);
}