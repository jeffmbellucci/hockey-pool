import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, UserPlus, Trash2, Pencil } from "lucide-react";
import { api, User } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface UserManagementProps {
  users: User[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export const UserManagement = ({ users, loading, onRefresh }: UserManagementProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    name: "",
    lastName: ""
  });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState({
    email: "",
    password: "",
    name: "",
    lastName: ""
  });
  const { toast } = useToast();

  const handleCreateUser = async () => {
    try {
      if (!newUser.email || !newUser.password || !newUser.name) {
        toast({
          title: "Validation Error",
          description: "Please fill in all required fields",
          variant: "destructive"
        });
        return;
      }

      const response = await api.createUser({
        ...newUser,
        role: "player"
      });

      if (response.success) {
        toast({
          title: "Success",
          description: "User created successfully"
        });
        setIsDialogOpen(false);
        setNewUser({ email: "", password: "", name: "", lastName: "" });
        await onRefresh();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create user",
        variant: "destructive"
      });
    }
  };

  const handleEditClick = (user: User) => {
    setEditingUser(user);
    setEditUser({
      email: user.email,
      password: "",
      name: user.name,
      lastName: user.lastName || ""
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    try {
      if (!editUser.email || !editUser.name) {
        toast({
          title: "Validation Error",
          description: "Email and name are required",
          variant: "destructive"
        });
        return;
      }

      // Only include fields that have been changed or are not empty
      const updateData: any = {
        email: editUser.email,
        name: editUser.name,
        lastName: editUser.lastName
      };

      // Only include password if it was provided
      if (editUser.password) {
        if (editUser.password.length < 8) {
          toast({
            title: "Validation Error",
            description: "Password must be at least 8 characters long",
            variant: "destructive"
          });
          return;
        }
        updateData.password = editUser.password;
      }

      const response = await api.updateUser(editingUser.id, updateData);

      if (response.success) {
        toast({
          title: "Success",
          description: "User updated successfully"
        });
        setIsEditDialogOpen(false);
        setEditingUser(null);
        setEditUser({ email: "", password: "", name: "", lastName: "" });
        await onRefresh();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update user",
        variant: "destructive"
      });
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    
    try {
      const response = await api.deleteUser(userId);
      if (response.success) {
        toast({
          title: "Success",
          description: "User deleted successfully"
        });
        await onRefresh();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete user",
        variant: "destructive"
      });
    }
  };

  const handleToggleUserStatus = async (userId: number, currentStatus: boolean) => {
    try {
      const response = await api.updateUserStatus(userId, !currentStatus);
      if (response.success) {
        toast({
          title: "Success",
          description: `User ${!currentStatus ? 'activated' : 'deactivated'} successfully`
        });
        await onRefresh();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update user status",
        variant: "destructive"
      });
    }
  };

  return (
    <Card className="shadow-ice">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>User Management</span>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gradient-hockey">
                <UserPlus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>
                  Add a new player to the hockey pool. All users are created with the "Player" role.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="player@example.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    placeholder="John"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    value={newUser.lastName}
                    onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min. 8 characters"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateUser} className="gradient-hockey">
                  Create User
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading users...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No users found. Create your first user to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-accent/20 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium">{user.name[0].toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-medium">{user.name} {user.lastName}</p>
                      <p className="text-sm text-muted-foreground break-all">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={user.active ? "text-success border-success" : "text-muted-foreground border-muted-foreground"}
                    >
                      {user.active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Badge variant="secondary">{user.role}</Badge>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => handleToggleUserStatus(user.id, user.active || false)}
                    >
                      {user.active ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      aria-label="Edit user"
                      onClick={() => handleEditClick(user)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      aria-label="Delete user"
                      onClick={() => handleDeleteUser(user.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information. Leave password blank to keep current password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email *</Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="player@example.com"
                value={editUser.email}
                onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                placeholder="John"
                value={editUser.name}
                onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lastName">Last Name</Label>
              <Input
                id="edit-lastName"
                placeholder="Doe"
                value={editUser.lastName}
                onChange={(e) => setEditUser({ ...editUser, lastName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">New Password</Label>
              <Input
                id="edit-password"
                type="password"
                placeholder="Leave blank to keep current"
                value={editUser.password}
                onChange={(e) => setEditUser({ ...editUser, password: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateUser} className="gradient-hockey">
              Update User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

