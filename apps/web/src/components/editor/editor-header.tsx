"use client";

import { Button } from "../ui/button";
import { ChevronDown, ArrowLeft, SquarePen, Trash } from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { KeyboardShortcutsHelp } from "../keyboard-shortcuts-help";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import Link from "next/link";
import { RenameProjectDialog } from "../rename-project-dialog";
import { DeleteProjectDialog } from "../delete-project-dialog";
import { useRouter } from "next/navigation";
import { FaDiscord } from "react-icons/fa6";
import { PanelPresetSelector } from "./panel-preset-selector";
import { ExportButton } from "./export-button";
import { ThemeToggle } from "../theme-toggle";
import { SOCIAL_LINKS } from "@/constants/app-constants";

export function EditorHeader() {
  return (
    <header className="bg-background pt-0.5 flex h-[3.2rem] items-center justify-between px-3">
      <div className="flex items-center gap-2">
        <ProjectDropdown />
      </div>
      <nav className="flex items-center gap-2">
        <PanelPresetSelector />
        <KeyboardShortcutsHelp />
        <ExportButton />
        <ThemeToggle />
      </nav>
    </header>
  );
}

function ProjectDropdown() {
  const { activeProject, renameProject, deleteProject } = useProjectStore();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const router = useRouter();

  const handleNameSave = async (newName: string) => {
    console.log("handleNameSave", newName);
    if (activeProject && newName.trim() && newName !== activeProject.name) {
      try {
        await renameProject(activeProject.id, newName.trim());
        setIsRenameDialogOpen(false);
      } catch (error) {
        console.error("Failed to rename project:", error);
      }
    }
  };

  const handleDelete = () => {
    if (activeProject) {
      deleteProject(activeProject.id);
      setIsDeleteDialogOpen(false);
      router.push("/projects");
    }
  };

  return (
    <>
    <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              className="flex h-auto items-center justify-center px-2.5 py-1.5"
            >
              <ChevronDown className="text-muted-foreground" />
              <span className="mr-2 text-[0.85rem]">{activeProject?.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-100 w-40">
            <Link href="/projects">
              <DropdownMenuItem className="flex items-center gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                Projects
              </DropdownMenuItem>
            </Link>
            <DropdownMenuItem
              className="flex items-center gap-1.5"
              onClick={() => setIsRenameDialogOpen(true)}
            >
              <SquarePen className="h-4 w-4" />
              Rename project
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              className="flex items-center gap-1.5"
              onClick={() => setIsDeleteDialogOpen(true)}
            >
              <Trash className="h-4 w-4" />
              Delete Project
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href={SOCIAL_LINKS.discord}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5"
              >
                <FaDiscord className="h-4 w-4" />
                Discord
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <RenameProjectDialog
          isOpen={isRenameDialogOpen}
          onOpenChange={setIsRenameDialogOpen}
          onConfirm={handleNameSave}
          projectName={activeProject?.name || ""}
        />
        <DeleteProjectDialog
          isOpen={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          onConfirm={handleDelete}
          projectName={activeProject?.name || ""}
        />
        </>
    );
}
