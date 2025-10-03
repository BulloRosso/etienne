# Refactoring of Filesystem.jsx
Currently Filesystem.jsx is a read only view of the file system.

We want to add the following options:
* dragging files to folders or to the root (upload)
* removing or renaming files or folders
* dragging files from on folder to another folder or to root level

Therefore we need to replace the existing component.

## New component and implementation strategy

#### Backend API methods in workspace controller
in the backend in /api/workspace/<project>/files/<path> we need to implement DELETE and POST to delete or move files or directories.

Implement other methods in this controller as required.

#### Material Design File Tree Component (React)

Overview: Implementing a Material Design-styled file system tree in React can be achieved using Material-UI (MUI) components. The solution involves an interactive TreeView with nested TreeItem nodes for folders and files, plus features for drag-and-drop uploads, renaming, and deletion. Below we outline a component structure, key logic for each feature, and references to open-source implementations that support these capabilities.
Tree Structure with MUI TreeView
Material-UI’s TreeView is ideal for a file explorer UI
v5-0-6.mui.com
. It displays a hierarchical list of folders and files, where each TreeItem can nest child items. For example, a basic tree might be defined as:
```
import { TreeView, TreeItem } from '@mui/lab';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

<TreeView
  defaultCollapseIcon={<ExpandMoreIcon />}
  defaultExpandIcon={<ChevronRightIcon />}
  aria-label="file system navigator"
>
  <TreeItem nodeId="1" label="Documents" icon={<FolderIcon />}>
    <TreeItem nodeId="2" label="Work Files" icon={<FolderIcon />}/>
    <TreeItem nodeId="3" label="Personal" icon={<FolderIcon />}>
      <TreeItem nodeId="4" label="Vacation Photos" icon={<InsertDriveFileIcon />}/>
      <TreeItem nodeId="5" label="Budget.xlsx" icon={<InsertDriveFileIcon />}/>
    </TreeItem>
  </TreeItem>
  <TreeItem nodeId="6" label="Downloads" icon={<FolderIcon />}/>
</TreeView>
```

In this structure, folders are represented by parent TreeItems containing children, and files are leaf TreeItems (no children). We use generic folder and file icons from MUI’s icon library for visual cues (e.g. <FolderIcon /> for folders, <InsertDriveFileIcon /> for files). MUI’s TreeView allows unlimited nesting of TreeItems to represent deeply nested folders
v5-0-6.mui.com
. The component’s default expand/collapse affordances (chevrons) and styling follow Material Design, and can be customized via props (e.g. defaultCollapseIcon, defaultExpandIcon, or using the icon/endIcon props on TreeItem)
mui.com
. State Management: The tree data can be managed in local React state, for example as an array of node objects or a nested object structure. Each node might include an id, a parentId (for hierarchy), a name (label), and a flag like isDir to distinguish folders vs files. On user actions (adding, renaming, deleting), this state is updated and the TreeView re-renders accordingly. No backend integration is required – all changes are maintained in-memory.
Drag-and-Drop File Uploads into Folders
To support drag-and-drop uploads, we can make each folder TreeItem a drop target. This allows users to drag files from their OS file explorer and drop them onto a folder node in the tree. In the component, you’d handle HTML5 drag events on the folder’s label or TreeItem content:
Use onDragOver (with event.preventDefault()) to allow dropping.
Use onDrop on the folder TreeItem to handle the file addition.
When a file is dropped, the onDrop handler can access the file(s) via the event’s dataTransfer.files list
. For example:
```
function handleDragOver(event) {
  event.preventDefault(); // Allow drop
}
function handleDrop(event, targetFolderId) {
  event.preventDefault();
  const files = Array.from(event.dataTransfer.files);
  // Update state: add each file under the folder with id=targetFolderId
  files.forEach(file => {
    const newFileNode = { id: generateId(), name: file.name, parentId: targetFolderId, isDir: false };
    // ... update your state tree with newFileNode ...
  });
}
...
<TreeItem 
  nodeId={folder.id} 
  label={folder.name} 
  icon={<FolderIcon />}
  onDragOver={handleDragOver}
  onDrop={(e) => handleDrop(e, folder.id)}
>
  {folder.children.map(...)} 
</TreeItem>
```
In the code above, handleDrop prevents the default browser behavior and retrieves the dropped file objects. These are then converted to new file nodes in the tree state (with a generated id and the dropped file’s name). Note: It’s important to call event.preventDefault() in drag event handlers to avoid the browser opening the file instead of uploading

. This approach uses the native HTML5 Drag and Drop API. Alternatively, you could integrate a library like react-dropzone (for easier file drop handling) by wrapping folder labels in a Dropzone, but for a simple implementation native events work fine. Drag-and-drop reordering of nodes is not required (and thus not implemented here), simplifying the logic since we only handle external file drops and not moving tree items around.
Renaming and Deleting Nodes
Renaming (Inline Editing): To allow renaming of files/folders, the component can toggle a TreeItem into an “edit mode” where a text field is shown. For example, on a rename action (perhaps triggered by a context menu option or double-click), you would render an <TextField> (Material UI text input) in place of the TreeItem label. The new name entered by the user then updates the node’s name in state. MUI’s TreeView RichTreeView supports built-in label editing as of v8 – by setting isItemEditable={true} or similar, users can double-click or press Enter to edit a node’s label inline
mui.com
. In our custom component, we can achieve this by managing an editingNodeId in state:
```
{node.id === editingNodeId ? (
  <TextField 
    value={tempName} 
    onChange={(e) => setTempName(e.target.value)} 
    onBlur={() => saveName(node.id)} 
    onKeyDown={(e) => { if(e.key === 'Enter') saveName(node.id); }} 
  />
) : (
  <span onDoubleClick={() => setEditingNodeId(node.id)}>
    {node.name}
  </span>
)}
```
In the snippet above, double-clicking a node’s label (span) enters edit mode by setting editingNodeId. The TextField allows the user to type a new name and either blur or press Enter to save (which calls a saveName function to update state and exit edit mode). If using MUI X’s RichTreeView, this is handled internally by the component when isItemEditable is true, saving the new label on Enter or blur and cancelling on Escape
mui.com
. Deleting: Deletion can be handled with a small trash icon button or via a right-click context menu. For example, you might render a delete icon (e.g. 🗑 from Material Icons) on hover of a TreeItem, or provide a context menu with “Delete”. When triggered, remove the node (and any children if a folder) from the state tree. The TreeView will update to reflect the removal. This is a straightforward state update – e.g., filter out the node by id and all descendants – and requires no special TreeView API. (If using context menus, MUI’s <Menu> component can be used to show options on right-click. This is optional; a simple button approach also works.)
Component Structure & Logic
Component Outline: A custom FileTree component might look like this:
State: treeData (hierarchical data for nodes), editingNodeId (for rename mode), and perhaps selected node state.
Render: A MUI <TreeView> containing recursive rendering of TreeItem nodes. Each TreeItem’s label includes an icon and text, or a TextField if that node is being edited.
Icons: Use Material icons for folder vs file. You can set a folder icon on non-leaf nodes and a file icon on leaves using TreeItem’s icon or endIcon props
mui.com
. For example, icon={<FolderIcon />} on folder items, and icon={<InsertDriveFileIcon />} on file items (or use endIcon for a trailing file icon).
Drag & Drop: Attach onDragOver and onDrop handlers to folder TreeItems (as shown above) to handle file uploads. Highlight the folder on drag-over (e.g., by adding a CSS class) for better UX.
Rename: Handle a rename trigger (double-click or button) by setting an editing state for that node. Render an input for the node’s label in edit mode. Save changes to state on confirm. (If using MUI X RichTreeView, simply enable isItemEditable and listen to onItemLabelChange callback
mui.com
mui.com
.)
Delete: Provide a UI control to delete. On delete, update state by removing the node and all its children. Possibly confirm the action with the user before deleting.
All state changes (adding a file node on drop, renaming, deleting) are done locally – e.g., using React’s useState or context – since no backend is in play. This keeps the component self-contained. You might define utility functions to find and update nodes in the nested state structure (for example, a function to insert a new file node under a given folder id, or to recursively remove a node subtree).

#### Icons to use
* import { PiFolderOpenThin } from "react-icons/pi";
* import { PiFolderThin } from "react-icons/pi";
* import { IoDocumentOutline } from "react-icons/io5";
* import { PiUploadLight } from "react-icons/pi";
