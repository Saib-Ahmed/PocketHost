import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { useApp } from '../store/AppContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ProjectSourceType, PublicUrlType } from '../types/project';
import { SUPPORTED_STACKS } from '../types/stack';
import { IconTrash, IconClose, IconCheck, IconGit } from '../components/Icons';
import { SoftwareManagerScreen } from './SoftwareManagerScreen';
import { NativePRootBootstrap } from '../native/NativePRootBootstrap';

interface ProjectConfigScreenProps {
  onSaved: () => void;
  selectedProjectId?: string;
}

export const ProjectConfigScreen: React.FC<ProjectConfigScreenProps> = ({
  onSaved,
  selectedProjectId,
}) => {
  const {
    projects,
    activeProjectId,
    setActiveProjectId,
    updateProject,
    deleteProject,
    localIpAddress,
    softwares,
  } = useApp();

  const [settingsSubTab, setSettingsSubTab] = useState<'project' | 'packages'>('project');

  const fallbackProj: ProjectItem = {
    id: '',
    name: 'New Project',
    stackId: 'node-api',
    port: 3000,
    entryFile: 'server.js',
    startCommand: 'node server.js',
    sourceType: 'STARTER_TEMPLATE',
    publicUrlType: 'cloudflare',
    envVars: [],
    status: 'STOPPED',
    uptimeSeconds: 0,
    createdAt: Date.now(),
  };

  const currentId = selectedProjectId || activeProjectId;
  const project = projects.find((p) => p.id === currentId) || projects[0] || fallbackProj;
  const stack = SUPPORTED_STACKS.find((s) => s.id === project.stackId) || SUPPORTED_STACKS[0];

  const [name, setName] = useState(project.name);
  const [port, setPort] = useState(project.port.toString());
  const [entryFile, setEntryFile] = useState(project.entryFile);
  const [startCommand, setStartCommand] = useState(project.startCommand);
  const [sourceType, setSourceType] = useState<ProjectSourceType>(project.sourceType || 'STARTER_TEMPLATE');
  const [zipFileName, setZipFileName] = useState<string | undefined>(project.zipFileName);
  const [sourcePath, setSourcePath] = useState<string | undefined>(project.sourcePath);
  const [gitRepoUrl, setGitRepoUrl] = useState<string>(project.gitRepoUrl || '');
  const [gitBranch, setGitBranch] = useState<string>(project.gitBranch || 'main');
  const [gitToken, setGitToken] = useState<string>(project.gitToken || '');
  const [publicUrlType, setPublicUrlType] = useState<PublicUrlType>(project.publicUrlType || 'cloudflare');
  const [envVars, setEnvVars] = useState(project.envVars || []);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  // Synchronize when switching projects
  useEffect(() => {
    setName(project.name);
    setPort(project.port.toString());
    setEntryFile(project.entryFile);
    setStartCommand(project.startCommand);
    setSourceType(project.sourceType || 'STARTER_TEMPLATE');
    setZipFileName(project.zipFileName);
    setSourcePath(project.sourcePath);
    setGitRepoUrl(project.gitRepoUrl || '');
    setGitBranch(project.gitBranch || 'main');
    setGitToken(project.gitToken || '');
    setPublicUrlType(project.publicUrlType || 'cloudflare');
    setEnvVars(project.envVars || []);
  }, [project.id]);

  const handlePickZip = async () => {
    try {
      const res = await NativePRootBootstrap.pickProjectZip(project.id);
      if (res?.success) {
        setZipFileName(res.fileName);
        updateProject(project.id, {
          zipFileName: res.fileName,
          sourceType: 'UPLOAD_ZIP',
        });
        Alert.alert(
          'Files Unpacked Successfully',
          `Extracted ${res.filesCount} file(s) from "${res.fileName}" (${res.sizeMb.toFixed(2)} MB) directly into project workspace.`
        );
      }
    } catch (e: any) {
      if (e.code !== 'CANCELLED') {
        Alert.alert('Upload Error', e.message || 'Failed to open file picker.');
      }
    }
  };

  const handlePickFolder = () => {
    const defaultFolder = `/storage/emulated/0/Download/${project.name.toLowerCase().replace(/\s+/g, '-')}`;
    setSourcePath(defaultFolder);
    Alert.alert('Folder Selected', `Linked to "${defaultFolder}".`);
  };

  const handleCloneGit = () => {
    if (!gitRepoUrl.trim()) {
      Alert.alert('Missing Repo URL', 'Please enter a valid GitHub repository URL.');
      return;
    }
    Alert.alert(
      'Git Clone Ready',
      `Repository "${gitRepoUrl}" (branch: ${gitBranch || 'main'}) will be cloned directly into your isolated workspace when service is started.`
    );
  };

  const addEnvVar = () => {
    if (!newKey.trim()) return;
    setEnvVars([...envVars, { key: newKey.trim(), value: newValue.trim() }]);
    setNewKey('');
    setNewValue('');
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const addQuickEnv = (key: string, defaultValue: string) => {
    const exists = envVars.some((v) => v.key === key);
    if (!exists) {
      setEnvVars([...envVars, { key, value: defaultValue }]);
    }
  };

  const handleSave = () => {
    const parsedPort = parseInt(port, 10);
    if (isNaN(parsedPort) || parsedPort < 1024 || parsedPort > 65535) {
      Alert.alert('Invalid Port', 'Please enter a valid unprivileged port number (1024 - 65535).');
      return;
    }

    updateProject(project.id, {
      name,
      port: parsedPort,
      entryFile,
      startCommand,
      sourceType,
      zipFileName,
      sourcePath,
      gitRepoUrl: gitRepoUrl.trim(),
      gitBranch: gitBranch.trim(),
      gitToken: gitToken.trim(),
      publicUrlType,
      envVars,
    });

    Alert.alert('Settings Saved', `Configuration for "${name}" has been updated.`);
    onSaved();
  };

  const handleDelete = () => {
    if (projects.length <= 1) {
      Alert.alert('Cannot Delete', 'You must have at least one project.');
      return;
    }
    Alert.alert(
      'Delete Project',
      `Are you sure you want to delete "${project.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteProject(project.id);
            onSaved();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Segmented Control: Service Config vs Installed Packages */}
      <View style={styles.topSegmentedBar}>
        <TouchableOpacity
          style={[styles.segmentBtn, settingsSubTab === 'project' && styles.segmentBtnActive]}
          onPress={() => setSettingsSubTab('project')}
          activeOpacity={0.7}
        >
          <Text style={[styles.segmentBtnText, settingsSubTab === 'project' && styles.segmentBtnTextActive]}>
            Service Config
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentBtn, settingsSubTab === 'packages' && styles.segmentBtnActive]}
          onPress={() => setSettingsSubTab('packages')}
          activeOpacity={0.7}
        >
          <Text style={[styles.segmentBtnText, settingsSubTab === 'packages' && styles.segmentBtnTextActive]}>
            Packages & Storage ({softwares.filter((s) => s.isInstalled).length})
          </Text>
        </TouchableOpacity>
      </View>

      {settingsSubTab === 'packages' ? (
        <SoftwareManagerScreen />
      ) : projects.length === 0 ? (
        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.content}>
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>No Projects Created Yet</Text>
            <Text style={[styles.helpText, { marginTop: 8 }]}>
              There are no active projects to configure. Go to the Dashboard or Stacks tab to create your first mobile-hosted backend or frontend service.
            </Text>
          </Card>
        </ScrollView>
      ) : (
        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Project Switcher Bar */}
          <View style={styles.projectSelectorHeader}>
            <Text style={styles.selectorLabel}>Configuring Project:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorPills}>
              {projects.map((p) => {
                const isCurrent = p.id === project.id;
                const pStack = SUPPORTED_STACKS.find((s) => s.id === p.stackId);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.selectorPill, isCurrent && styles.selectorPillActive]}
                    onPress={() => setActiveProjectId(p.id)}
                  >
                    <Text style={styles.selectorPillIcon}>{pStack?.icon || 'APP'}</Text>
                    <Text style={[styles.selectorPillText, isCurrent && styles.selectorPillTextActive]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

      {/* 1. General Settings Card */}
      <Card style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>General & Runtime</Text>
          <View style={styles.stackTag}>
            <Text style={styles.stackTagText}>{stack.name}</Text>
          </View>
        </View>

        <Text style={styles.inputLabel}>Project Name</Text>
        <TextInput
          style={styles.textInput}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Backend API"
          placeholderTextColor={colors.textMuted}
        />

        <View style={styles.row}>
          <View style={styles.halfCol}>
            <Text style={styles.inputLabel}>Port (1024 - 65535)</Text>
            <TextInput
              style={styles.textInput}
              value={port}
              onChangeText={setPort}
              keyboardType="numeric"
              placeholder="3000"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.halfCol}>
            <Text style={styles.inputLabel}>Entry File</Text>
            <TextInput
              style={styles.textInput}
              value={entryFile}
              onChangeText={setEntryFile}
              placeholder="server.js"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>

        <Text style={styles.inputLabel}>Start Command (Linux PRoot)</Text>
        <TextInput
          style={styles.textInput}
          value={startCommand}
          onChangeText={setStartCommand}
          placeholder="node server.js"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Card>

      {/* 2. Project Source & Code Upload Card */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Project Source & Code Upload</Text>
        <Text style={styles.cardSubtitle}>
          Choose how your application code files will be provided to the server:
        </Text>

        {/* Option: Starter Template */}
        <TouchableOpacity
          style={[styles.sourceOption, sourceType === 'STARTER_TEMPLATE' && styles.sourceOptionActive]}
          onPress={() => setSourceType('STARTER_TEMPLATE')}
          activeOpacity={0.7}
        >
          <View style={styles.sourceOptionLeft}>
            <View style={styles.sourceTag}>
              <Text style={styles.sourceTagText}>SAMPLE</Text>
            </View>
            <View>
              <Text style={styles.sourceOptionTitle}>Starter Template (Instant Test)</Text>
              <Text style={styles.sourceOptionDesc}>Built-in sample files ready to test immediately</Text>
            </View>
          </View>
          <View style={[styles.radioCircle, sourceType === 'STARTER_TEMPLATE' && styles.radioCircleActive]}>
            {sourceType === 'STARTER_TEMPLATE' && <View style={styles.radioDot} />}
          </View>
        </TouchableOpacity>

        {/* Option: GitHub Clone */}
        <TouchableOpacity
          style={[styles.sourceOption, sourceType === 'GITHUB' && styles.sourceOptionActive]}
          onPress={() => setSourceType('GITHUB')}
          activeOpacity={0.7}
        >
          <View style={styles.sourceOptionLeft}>
            <View style={styles.sourceTag}>
              <Text style={styles.sourceTagText}>GIT</Text>
            </View>
            <View>
              <Text style={styles.sourceOptionTitle}>Clone from GitHub</Text>
              <Text style={styles.sourceOptionDesc}>
                {gitRepoUrl ? `Repo: ${gitRepoUrl}` : 'Clone public or private repository from GitHub'}
              </Text>
            </View>
          </View>
          <View style={[styles.radioCircle, sourceType === 'GITHUB' && styles.radioCircleActive]}>
            {sourceType === 'GITHUB' && <View style={styles.radioDot} />}
          </View>
        </TouchableOpacity>

        {sourceType === 'GITHUB' && (
          <View style={styles.gitSection}>
            <Text style={styles.inputLabel}>GitHub Repository HTTPS URL</Text>
            <TextInput
              style={styles.textInput}
              value={gitRepoUrl}
              onChangeText={setGitRepoUrl}
              placeholder="https://github.com/username/my-backend-app"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.row}>
              <View style={styles.halfCol}>
                <Text style={styles.inputLabel}>Branch (default: main)</Text>
                <TextInput
                  style={styles.textInput}
                  value={gitBranch}
                  onChangeText={setGitBranch}
                  placeholder="main"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.halfCol}>
                <Text style={styles.inputLabel}>Access Token (Optional)</Text>
                <TextInput
                  style={styles.textInput}
                  value={gitToken}
                  onChangeText={setGitToken}
                  placeholder="ghp_xxxx (Private repo)"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <TouchableOpacity style={styles.gitTestBtn} onPress={handleCloneGit}>
              <Text style={styles.gitTestBtnText}>Test Repository Connection</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Option: Upload ZIP */}
        <TouchableOpacity
          style={[styles.sourceOption, sourceType === 'UPLOAD_ZIP' && styles.sourceOptionActive]}
          onPress={() => {
            setSourceType('UPLOAD_ZIP');
            handlePickZip();
          }}
          activeOpacity={0.7}
        >
          <View style={styles.sourceOptionLeft}>
            <View style={styles.sourceTag}>
              <Text style={styles.sourceTagText}>ZIP</Text>
            </View>
            <View>
              <Text style={styles.sourceOptionTitle}>Upload Project ZIP</Text>
              <Text style={styles.sourceOptionDesc}>
                {zipFileName ? `Selected: ${zipFileName}` : 'Select a .zip archive from phone storage'}
              </Text>
            </View>
          </View>
          <View style={[styles.radioCircle, sourceType === 'UPLOAD_ZIP' && styles.radioCircleActive]}>
            {sourceType === 'UPLOAD_ZIP' && <View style={styles.radioDot} />}
          </View>
        </TouchableOpacity>

        {sourceType === 'UPLOAD_ZIP' && (
          <TouchableOpacity style={styles.pickFileBtn} onPress={handlePickZip}>
            <Text style={styles.pickFileBtnText}>
              {zipFileName ? `Change ZIP (${zipFileName})` : 'Select .ZIP File from Storage'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Option: Wi-Fi Web Uploader */}
        <TouchableOpacity
          style={[styles.sourceOption, sourceType === 'WIFI_UPLOAD' && styles.sourceOptionActive]}
          onPress={() => setSourceType('WIFI_UPLOAD')}
          activeOpacity={0.7}
        >
          <View style={styles.sourceOptionLeft}>
            <View style={styles.sourceTag}>
              <Text style={styles.sourceTagText}>WIFI</Text>
            </View>
            <View>
              <Text style={styles.sourceOptionTitle}>Wi-Fi Web Uploader (Laptop/PC)</Text>
              <Text style={styles.sourceOptionDesc}>Drag & drop code directly from your computer browser</Text>
            </View>
          </View>
          <View style={[styles.radioCircle, sourceType === 'WIFI_UPLOAD' && styles.radioCircleActive]}>
            {sourceType === 'WIFI_UPLOAD' && <View style={styles.radioDot} />}
          </View>
        </TouchableOpacity>

        {sourceType === 'WIFI_UPLOAD' && (
          <View style={styles.wifiUploadBox}>
            <Text style={styles.wifiUploadTitle}>Drop Code from Laptop / PC:</Text>
            <Text style={styles.wifiUploadUrl}>http://{localIpAddress}:8088</Text>
            <Text style={styles.wifiUploadSub}>
              Ensure your computer is connected to the same Wi-Fi. Open the URL above in your computer's browser to upload your project directory directly.
            </Text>
          </View>
        )}

        {/* Option: Local Device Folder */}
        <TouchableOpacity
          style={[styles.sourceOption, sourceType === 'SELECT_FOLDER' && styles.sourceOptionActive]}
          onPress={() => {
            setSourceType('SELECT_FOLDER');
            handlePickFolder();
          }}
          activeOpacity={0.7}
        >
          <View style={styles.sourceOptionLeft}>
            <View style={styles.sourceTag}>
              <Text style={styles.sourceTagText}>DIR</Text>
            </View>
            <View>
              <Text style={styles.sourceOptionTitle}>Local Device Folder</Text>
              <Text style={styles.sourceOptionDesc}>
                {sourcePath ? `Linked: ${sourcePath}` : 'Point to an existing directory on phone storage'}
              </Text>
            </View>
          </View>
          <View style={[styles.radioCircle, sourceType === 'SELECT_FOLDER' && styles.radioCircleActive]}>
            {sourceType === 'SELECT_FOLDER' && <View style={styles.radioDot} />}
          </View>
        </TouchableOpacity>
      </Card>

      {/* 3. Public URL Option (Choose EXACTLY ONE) */}
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Public URL & Access</Text>
        <Text style={styles.cardSubtitle}>
          Select how this project will be accessed over the network (Pick 1):
        </Text>

        <TouchableOpacity
          style={[styles.urlOption, publicUrlType === 'cloudflare' && styles.urlOptionActive]}
          onPress={() => setPublicUrlType('cloudflare')}
          activeOpacity={0.7}
        >
          <View style={styles.urlOptionLeft}>
            <View style={styles.urlTag}>
              <Text style={styles.urlTagText}>CF</Text>
            </View>
            <View>
              <Text style={styles.urlOptionTitle}>Cloudflare Quick Tunnel (Recommended)</Text>
              <Text style={styles.urlOptionDesc}>Instant free HTTPS URL (*.trycloudflare.com)</Text>
            </View>
          </View>
          <View style={[styles.radioCircle, publicUrlType === 'cloudflare' && styles.radioCircleActive]}>
            {publicUrlType === 'cloudflare' && <View style={styles.radioDot} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.urlOption, publicUrlType === 'zrok' && styles.urlOptionActive]}
          onPress={() => setPublicUrlType('zrok')}
          activeOpacity={0.7}
        >
          <View style={styles.urlOptionLeft}>
            <View style={styles.urlTag}>
              <Text style={styles.urlTagText}>ZROK</Text>
            </View>
            <View>
              <Text style={styles.urlOptionTitle}>zrok Peer Tunnel</Text>
              <Text style={styles.urlOptionDesc}>High-speed OpenZiti decentralized URL (*.share.zrok.io)</Text>
            </View>
          </View>
          <View style={[styles.radioCircle, publicUrlType === 'zrok' && styles.radioCircleActive]}>
            {publicUrlType === 'zrok' && <View style={styles.radioDot} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.urlOption, publicUrlType === 'local' && styles.urlOptionActive]}
          onPress={() => setPublicUrlType('local')}
          activeOpacity={0.7}
        >
          <View style={styles.urlOptionLeft}>
            <View style={styles.urlTag}>
              <Text style={styles.urlTagText}>LAN</Text>
            </View>
            <View>
              <Text style={styles.urlOptionTitle}>Local Wi-Fi Only</Text>
              <Text style={styles.urlOptionDesc}>Direct LAN IP address for devices on same Wi-Fi</Text>
            </View>
          </View>
          <View style={[styles.radioCircle, publicUrlType === 'local' && styles.radioCircleActive]}>
            {publicUrlType === 'local' && <View style={styles.radioDot} />}
          </View>
        </TouchableOpacity>
      </Card>

      {/* 4. Environment Variables (Project-Wise) */}
      <Card style={styles.card}>
        <View style={styles.cardTitleRow}>
          <View>
            <Text style={styles.cardTitle}>Environment Variables (.env)</Text>
            <Text style={styles.cardSubtitle}>
              Configured per project (e.g. MONGODB_URI, JWT_SECRET, PORT)
            </Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{envVars.length}</Text>
          </View>
        </View>

        {/* Quick helpers for MongoDB Atlas and standard keys */}
        <View style={styles.quickEnvRow}>
          <TouchableOpacity
            style={styles.quickEnvPill}
            onPress={() => addQuickEnv('MONGODB_URI', 'mongodb+srv://user:pass@cluster.mongodb.net/dbname')}
          >
            <Text style={styles.quickEnvText}>+ MONGODB_URI (Atlas)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickEnvPill}
            onPress={() => addQuickEnv('JWT_SECRET', 'my-secret-key')}
          >
            <Text style={styles.quickEnvText}>+ JWT_SECRET</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickEnvPill}
            onPress={() => addQuickEnv('NODE_ENV', 'production')}
          >
            <Text style={styles.quickEnvText}>+ NODE_ENV</Text>
          </TouchableOpacity>
        </View>

        {/* Env Variables List */}
        {envVars.map((env, index) => (
          <View key={index} style={styles.envRow}>
            <View style={styles.envBox}>
              <Text style={styles.envKey}>{env.key}</Text>
              <Text style={styles.envEquals}>=</Text>
              <Text style={styles.envValue} numberOfLines={1}>
                {env.key.includes('URI') || env.key.includes('SECRET') || env.key.includes('KEY')
                  ? '••••••••••••••••••••'
                  : env.value}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.deleteEnvBtn}
              onPress={() => removeEnvVar(index)}
            >
              <IconClose size={11} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ))}

        {/* Add New Key-Value */}
        <View style={styles.addEnvSection}>
          <Text style={styles.inputLabel}>Add Variable</Text>
          <View style={styles.addEnvInputs}>
            <TextInput
              style={[styles.textInput, styles.addKeyInput]}
              value={newKey}
              onChangeText={setNewKey}
              placeholder="VARIABLE_KEY"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <TextInput
              style={[styles.textInput, styles.addValInput]}
              value={newValue}
              onChangeText={setNewValue}
              placeholder="variable_value"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={addEnvVar}>
            <Text style={styles.addBtnText}>+ Add to .env</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Save & Delete Controls */}
      <View style={styles.bottomControls}>
        <Button
          title="Save Configuration"
          onPress={handleSave}
          variant="primary"
          icon={<IconCheck size={14} color="#FFFFFF" />}
        />

        <TouchableOpacity style={styles.deleteProjectBtn} onPress={handleDelete}>
          <IconTrash size={13} color="#EF4444" />
          <Text style={styles.deleteProjectText}>Delete Project</Text>
        </TouchableOpacity>
      </View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topSegmentedBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: 6,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.4)',
  },
  segmentBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentBtnTextActive: {
    color: '#A5B4FC',
    fontWeight: '800',
  },
  scrollArea: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  projectSelectorHeader: {
    marginBottom: 14,
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  selectorPills: {
    flexDirection: 'row',
    gap: 8,
  },
  selectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  selectorPillActive: {
    backgroundColor: colors.surfaceHighlight,
    borderColor: colors.primary,
  },
  selectorPillIcon: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    color: '#A5B4FC',
  },
  selectorPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  selectorPillTextActive: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  card: {
    padding: 16,
    marginBottom: 14,
    borderRadius: 14,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 10,
  },
  stackTag: {
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stackTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  countBadge: {
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 5,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: colors.surfaceHighlight,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfCol: {
    flex: 1,
  },
  sourceOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceHighlight,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 8,
  },
  sourceOptionActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  sourceOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  sourceTag: {
    width: 44,
    height: 26,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sourceTagText: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    color: '#A5B4FC',
    letterSpacing: 0.5,
  },
  sourceOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sourceOptionDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  gitSection: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    padding: 10,
    marginBottom: 10,
    marginHorizontal: 4,
  },
  gitTestBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    borderRadius: 7,
    alignItems: 'center',
    marginTop: 8,
  },
  gitTestBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  pickFileBtn: {
    backgroundColor: colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
    marginHorizontal: 4,
  },
  pickFileBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  wifiUploadBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    marginHorizontal: 4,
  },
  wifiUploadTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38BDF8',
  },
  wifiUploadUrl: {
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '800',
    color: '#FFFFFF',
    marginVertical: 4,
  },
  wifiUploadSub: {
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 14,
  },
  urlOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceHighlight,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 8,
  },
  urlOptionActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  urlOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  urlTag: {
    width: 44,
    height: 26,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  urlTagText: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
    color: '#A5B4FC',
    letterSpacing: 0.5,
  },
  urlOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  urlOptionDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleActive: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  quickEnvRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  quickEnvPill: {
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  quickEnvText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
  },
  envRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  envBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  envKey: {
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: colors.textPrimary,
  },
  envEquals: {
    fontSize: 12,
    color: colors.textMuted,
    marginHorizontal: 6,
  },
  envValue: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: colors.textSecondary,
    flex: 1,
  },
  deleteEnvBtn: {
    padding: 6,
  },
  deleteEnvText: {
    fontSize: 13,
    color: colors.error,
    fontWeight: '700',
  },
  addEnvSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 8,
  },
  addEnvInputs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  addKeyInput: {
    flex: 1,
  },
  addValInput: {
    flex: 1.5,
  },
  addBtn: {
    backgroundColor: colors.surfaceHighlight,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  bottomControls: {
    marginTop: 10,
    gap: 12,
  },
  deleteProjectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  deleteProjectText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.error,
  },
});
