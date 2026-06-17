import consoleIconUrl from "material-icon-theme/icons/console.svg";
import cssIconUrl from "material-icon-theme/icons/css.svg";
import dockerIconUrl from "material-icon-theme/icons/docker.svg";
import fileIconUrl from "material-icon-theme/icons/file.svg";
import folderIconUrl from "material-icon-theme/icons/folder.svg";
import folderOpenIconUrl from "material-icon-theme/icons/folder-open.svg";
import htmlIconUrl from "material-icon-theme/icons/html.svg";
import imageIconUrl from "material-icon-theme/icons/image.svg";
import javascriptIconUrl from "material-icon-theme/icons/javascript.svg";
import jsonIconUrl from "material-icon-theme/icons/json.svg";
import licenseIconUrl from "material-icon-theme/icons/license.svg";
import markdownIconUrl from "material-icon-theme/icons/markdown.svg";
import pythonIconUrl from "material-icon-theme/icons/python.svg";
import svgIconUrl from "material-icon-theme/icons/svg.svg";
import typescriptIconUrl from "material-icon-theme/icons/typescript.svg";
import xmlIconUrl from "material-icon-theme/icons/xml.svg";
import yamlIconUrl from "material-icon-theme/icons/yaml.svg";

export type SkillFileIconKind =
  | "folder"
  | "folder-open"
  | "python"
  | "javascript"
  | "typescript"
  | "json"
  | "yaml"
  | "markdown"
  | "html"
  | "css"
  | "shell"
  | "docker"
  | "xml"
  | "svg"
  | "image"
  | "license"
  | "file";

const ICON_KIND_BY_EXTENSION: Record<string, SkillFileIconKind> = {
  css: "css",
  gif: "image",
  htm: "html",
  html: "html",
  jpeg: "image",
  jpg: "image",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  md: "markdown",
  mdx: "markdown",
  mjs: "javascript",
  png: "image",
  py: "python",
  sh: "shell",
  svg: "svg",
  ts: "typescript",
  tsx: "typescript",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "shell",
};

const ICON_KIND_BY_BASENAME: Record<string, SkillFileIconKind> = {
  dockerfile: "docker",
  license: "license",
  "license.md": "license",
  "license.txt": "license",
  "package.json": "json",
  "skill.md": "markdown",
  "tsconfig.json": "json",
};

const ICON_URL_BY_KIND: Record<SkillFileIconKind, string> = {
  css: cssIconUrl,
  docker: dockerIconUrl,
  file: fileIconUrl,
  folder: folderIconUrl,
  "folder-open": folderOpenIconUrl,
  html: htmlIconUrl,
  image: imageIconUrl,
  javascript: javascriptIconUrl,
  json: jsonIconUrl,
  license: licenseIconUrl,
  markdown: markdownIconUrl,
  python: pythonIconUrl,
  shell: consoleIconUrl,
  svg: svgIconUrl,
  typescript: typescriptIconUrl,
  xml: xmlIconUrl,
  yaml: yamlIconUrl,
};

export function getSkillFileIconKind(
  path: string,
  isDirectory: boolean,
  isOpen = false,
): SkillFileIconKind {
  if (isDirectory) {
    return isOpen ? "folder-open" : "folder";
  }

  const fileName = path.split("/").pop()?.toLowerCase() || "";
  if (ICON_KIND_BY_BASENAME[fileName]) {
    return ICON_KIND_BY_BASENAME[fileName];
  }

  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  if (!extension) {
    return "file";
  }

  return ICON_KIND_BY_EXTENSION[extension] || "file";
}

export function getSkillFileIconUrl(
  path: string,
  isDirectory: boolean,
  isOpen = false,
): string {
  return ICON_URL_BY_KIND[getSkillFileIconKind(path, isDirectory, isOpen)];
}
