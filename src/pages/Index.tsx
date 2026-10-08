import { useState } from "react";
import { FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/features/interior/cloud/useProjects";
import { Workbench } from "@/features/interior/components/Workbench";
import { AuthDialog } from "@/features/interior/components/AuthDialog";
import { ProjectDialog } from "@/features/interior/components/ProjectDialog";
import type { Design } from "@/features/interior/model/types";
import { createProject } from "@/features/interior/data/templates";
const Index = () => {
  const projects = useProjects(),
    [projectOpen, setProjectOpen] = useState(false),
    [authOpen, setAuthOpen] = useState(false);
  const cloudSave = () => {
    if (!projects.session) {
      setAuthOpen(true);
      return;
    }
    if (projects.active)
      void projects.create(
        { ...projects.active, name: projects.active.name + " · 云端副本" },
        true,
      );
  };
  const importProject = (d: Design, name: string) => {
    void projects.create(
      { ...createProject(d.template, name), state: d },
      !!projects.active?.cloud,
    );
  };
  return (
    <>
      {projects.active ? (
        <Workbench
          key={projects.active.id}
          project={projects.active}
          update={projects.update}
          status={projects.status}
          loggedIn={!!projects.session}
          email={projects.session?.user.email}
          projects={() => setProjectOpen(true)}
          login={() => setAuthOpen(true)}
          logout={() => void projects.signOut()}
          save={() => void projects.save()}
          cloudSave={cloudSave}
          importProject={importProject}
        />
      ) : (
        <div className="no-project">
          <FolderOpen size={44} />
          <h1>给新空间，一个新开始</h1>
          <p>创建空白户型，或从已有项目继续设计。</p>
          <Button onClick={() => setProjectOpen(true)}>
            <Plus />
            新建 / 打开项目
          </Button>
        </div>
      )}
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      <ProjectDialog
        open={projectOpen}
        onOpenChange={setProjectOpen}
        guests={projects.guests}
        cloud={projects.cloud}
        active={projects.active}
        loggedIn={!!projects.session}
        loading={projects.loading}
        hasMore={projects.hasMore}
        loadMore={() => void projects.loadMore()}
        reload={() => void projects.reload()}
        onOpen={projects.open}
        onCreate={projects.create}
        onRemove={projects.remove}
        onRename={projects.rename}
        onDuplicate={projects.duplicate}
        login={() => setAuthOpen(true)}
      />
    </>
  );
};
export default Index;
