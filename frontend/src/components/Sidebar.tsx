import React, { useState } from 'react';
import { MessageSquare, Network, Trash2, X, Sun, Moon, Plus, FolderOpen, LogOut, Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useTheme } from '../lib/ThemeContext';
import { useAuth } from '../lib/AuthContext';
import type { Case } from '../lib/api';

interface SidebarProps {
  activeTab: 'chat' | 'graph';
  onTabChange: (tab: 'chat' | 'graph') => void;
  onClearMemory: () => void;
  cases: Case[];
  selectedCaseId: number | null;
  onSelectCase: (caseId: number) => void;
  onCreateCase: (title: string) => void;
  onDeleteCase: (caseId: number) => void;
  isCasesLoading: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onClearMemory,
  cases,
  selectedCaseId,
  onSelectCase,
  onCreateCase,
  onDeleteCase,
  isCasesLoading,
}) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showNewCase, setShowNewCase] = useState(false);
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const [deletingCaseId, setDeletingCaseId] = useState<number | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  const handleClear = () => {
    onClearMemory();
    setShowConfirm(false);
  };

  const handleCreateCase = () => {
    if (newCaseTitle.trim()) {
      onCreateCase(newCaseTitle.trim());
      setNewCaseTitle('');
      setShowNewCase(false);
    }
  };

  const handleDeleteCase = (caseId: number) => {
    setDeletingCaseId(caseId);
  };

  const confirmDeleteCase = () => {
    if (deletingCaseId) {
      onDeleteCase(deletingCaseId);
      setDeletingCaseId(null);
    }
  };

  if (isCollapsed) {
    return (
      <div className="w-16 bg-card border-r border-border flex flex-col items-center py-4 gap-4 transition-all duration-300 ease-in-out">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="mb-4 animate-fade-in"
        >
          <Network className="w-5 h-5" />
        </Button>
        <Button
          variant={activeTab === 'chat' ? 'default' : 'ghost'}
          size="icon"
          onClick={() => onTabChange('chat')}
          className="animate-fade-in"
          style={{ animationDelay: '50ms' }}
        >
          <MessageSquare className="w-5 h-5" />
        </Button>
        <Button
          variant={activeTab === 'graph' ? 'default' : 'ghost'}
          size="icon"
          onClick={() => onTabChange('graph')}
          className="animate-fade-in"
          style={{ animationDelay: '100ms' }}
        >
          <Network className="w-5 h-5" />
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="animate-scale-in"
          style={{ animationDelay: '150ms' }}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Button>
      </div>
    );
  }

  return (
    <div className="w-72 bg-card border-r border-border flex flex-col p-4 transition-all duration-300 ease-in-out overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 animate-fade-in">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center animate-scale-in shrink-0">
            <Network className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-bold whitespace-nowrap">Crime Unit</h1>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8 animate-scale-in"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(true)}
            className="h-8 w-8"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* User Info */}
      {user && (
        <div className="mb-4 p-2 bg-muted rounded-lg flex items-center justify-between">
          <span className="text-xs text-muted-foreground truncate">{user.email}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            className="h-6 w-6 shrink-0"
            title="Logout"
          >
            <LogOut className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Cases Section */}
      <div className="mb-4 flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Cases
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowNewCase(true)}
            className="h-6 w-6"
            title="New Case"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* New Case Input */}
        {showNewCase && (
          <div className="mb-2 p-2 bg-muted rounded-lg animate-scale-in">
            <Input
              value={newCaseTitle}
              onChange={(e) => setNewCaseTitle(e.target.value)}
              placeholder="Case title..."
              className="mb-2 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateCase();
                if (e.key === 'Escape') setShowNewCase(false);
              }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreateCase} className="flex-1">
                Create
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowNewCase(false)} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Cases List */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {isCasesLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : cases.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No cases yet. Create one to start!
            </p>
          ) : (
            cases.map((caseItem) => (
              <div
                key={caseItem.id}
                className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${selectedCaseId === caseItem.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                  }`}
                onClick={() => onSelectCase(caseItem.id)}
              >
                <FolderOpen className="w-4 h-4 shrink-0" />
                <span className="text-sm truncate flex-1">{caseItem.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity ${selectedCaseId === caseItem.id ? 'hover:bg-primary-foreground/20' : ''
                    }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCase(caseItem.id);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Delete Case Confirmation */}
      {deletingCaseId && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg animate-scale-in">
          <p className="text-xs text-destructive-foreground mb-2">
            Delete this case and all its data?
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={confirmDeleteCase} className="flex-1">
              Delete
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDeletingCaseId(null)} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="mb-4">
        <h2 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
          Navigation
        </h2>
        <div className="space-y-1">
          <Button
            variant={activeTab === 'chat' ? 'default' : 'ghost'}
            onClick={() => onTabChange('chat')}
            className="w-full justify-start"
          >
            <MessageSquare className="w-4 h-4 mr-2 shrink-0" />
            <span className="whitespace-nowrap">Investigation</span>
          </Button>
          <Button
            variant={activeTab === 'graph' ? 'default' : 'ghost'}
            onClick={() => onTabChange('graph')}
            className="w-full justify-start"
          >
            <Network className="w-4 h-4 mr-2 shrink-0" />
            <span className="whitespace-nowrap">Evidence Board</span>
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto">
        <h2 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
          Actions
        </h2>
        {!showConfirm ? (
          <Button
            variant="destructive"
            onClick={() => setShowConfirm(true)}
            className="w-full justify-start"
            disabled={!selectedCaseId}
          >
            <Trash2 className="w-4 h-4 mr-2 shrink-0" />
            <span className="whitespace-nowrap">Clear Case Memory</span>
          </Button>
        ) : (
          <div className="space-y-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg animate-scale-in">
              <p className="text-xs text-destructive-foreground">
                Clear all evidence from this case?
            </p>
            <div className="flex gap-2">
                <Button variant="destructive" size="sm" onClick={handleClear} className="flex-1">
                Yes
              </Button>
                <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)} className="flex-1">
                No
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
